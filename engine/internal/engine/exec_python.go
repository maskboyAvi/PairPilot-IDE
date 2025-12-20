package engine

import (
	"bufio"
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

func (h *Handler) runPython(ctx context.Context, re *runEntry, req ExecuteRequest) {
	// Note: we intentionally do NOT set StartedAt yet.
	// If Docker sandbox needs to spin up / pull an image, we don't want that time counted as execution time.
	re.Update(func(r *Run) {
		r.Status = RunRunning
	})

	tmpDir, err := os.MkdirTemp("", "pairpilot-run-*")
	if err != nil {
		h.finishWithError(re, "internal", err)
		return
	}
	defer os.RemoveAll(tmpDir)

	codePath := filepath.Join(tmpDir, "main.py")
	if err := os.WriteFile(codePath, []byte(req.Code), 0600); err != nil {
		h.finishWithError(re, "internal", err)
		return
	}

	// If using Docker sandbox, ensure the image exists first.
	// NOTE: the sandbox itself runs with --network none, so image pulling must happen here.
	if h.cfg.Sandbox == "docker" {
		prepStart := time.Now()
		re.Publish(Event{
			Type:    "run.phase",
			RunID:   re.run.ID,
			Phase:   "preparing",
			Message: "Preparing Docker sandbox (pulling image if needed)…",
		})
		select {
		case <-ctx.Done():
			h.finishWithError(re, "canceled", context.Canceled)
			return
		default:
		}

		if err := h.ensureDockerImageReady(ctx, h.cfg.DockerImage); err != nil {
			h.finishWithError(re, "docker", err)
			return
		}

		prepMs := time.Since(prepStart).Milliseconds()
		re.Publish(Event{
			Type:    "run.phase",
			RunID:   re.run.ID,
			Phase:   "ready",
			Message: "Docker sandbox ready",
			PrepMs:  &prepMs,
		})
	}

	execTimeout := time.Duration(req.TimeoutMs) * time.Millisecond
	if execTimeout <= 0 {
		if h.cfg.Sandbox == "docker" {
			execTimeout = 15 * time.Second
		} else {
			execTimeout = 8 * time.Second
		}
	}
	ctx, cancel := context.WithTimeout(ctx, execTimeout)
	defer cancel()

	cmd, err := h.buildPythonCommand(ctx, tmpDir, codePath, req)
	if err != nil {
		h.finishWithError(re, "internal", err)
		return
	}

	stdinPipe, err := cmd.StdinPipe()
	if err != nil {
		h.finishWithError(re, "internal", err)
		return
	}
	stdoutPipe, err := cmd.StdoutPipe()
	if err != nil {
		h.finishWithError(re, "internal", err)
		return
	}
	stderrPipe, err := cmd.StderrPipe()
	if err != nil {
		h.finishWithError(re, "internal", err)
		return
	}

	// Start the process and start the execution clock only after the sandbox is ready.
	if err := cmd.Start(); err != nil {
		h.finishWithError(re, "internal", err)
		return
	}

	startedAt := time.Now().UTC()
	re.Update(func(r *Run) {
		r.StartedAt = &startedAt
	})
	startedAtStr := startedAt.Format(time.RFC3339Nano)
	re.Publish(Event{Type: "run.started", RunID: re.run.ID, At: &startedAtStr})

	// Periodically publish lightweight stats so the UI can show progress.
	statsStop := make(chan struct{})
	defer close(statsStop)
	go h.streamStats(re, statsStop)

	// Write stdin (best-effort) and close.
	go func() {
		_, _ = io.WriteString(stdinPipe, req.Stdin)
		_ = stdinPipe.Close()
	}()

	// Stream stdout/stderr.
	done := make(chan struct{}, 2)
	go h.streamPipe(re, "run.stdout", stdoutPipe, done)
	go h.streamPipe(re, "run.stderr", stderrPipe, done)

	err = cmd.Wait()
	<-done
	<-done

	finishedAt := time.Now().UTC()
	finishedAtStr := finishedAt.Format(time.RFC3339Nano)

	if errors.Is(ctx.Err(), context.Canceled) {
		exit := -1
		re.Update(func(r *Run) {
			r.Status = RunCanceled
			r.ExitCode = &exit
			r.ErrorCode = "canceled"
			r.ErrorMsg = "canceled"
			r.FinishedAt = &finishedAt
		})
		re.Publish(Event{Type: "run.error", RunID: re.run.ID, Code: "canceled", Message: "canceled"})
		h.publishStats(re)
		re.Publish(Event{Type: "run.finished", RunID: re.run.ID, ExitCode: &exit, At: &finishedAtStr})
		return
	}

	if errors.Is(ctx.Err(), context.DeadlineExceeded) {
		exit := -1
		re.Update(func(r *Run) {
			r.Status = RunTimeout
			r.ExitCode = &exit
			r.ErrorCode = "timeout"
			r.ErrorMsg = "execution timed out"
			r.FinishedAt = &finishedAt
		})
		re.Publish(Event{Type: "run.error", RunID: re.run.ID, Code: "timeout", Message: "execution timed out"})
		h.publishStats(re)
		re.Publish(Event{Type: "run.finished", RunID: re.run.ID, ExitCode: &exit, At: &finishedAtStr})
		return
	}

	exitCode := 0
	if err != nil {
		if ee := new(exec.ExitError); errors.As(err, &ee) {
			exitCode = ee.ExitCode()
		} else {
			exitCode = -1
		}
	}

	status := RunFinished
	if exitCode != 0 {
		status = RunFailed
	}

	re.Update(func(r *Run) {
		r.Status = status
		r.ExitCode = &exitCode
		r.FinishedAt = &finishedAt
	})
	h.publishStats(re)
	re.Publish(Event{Type: "run.finished", RunID: re.run.ID, ExitCode: &exitCode, At: &finishedAtStr})
}

func (h *Handler) buildPythonCommand(ctx context.Context, tmpDir, codePath string, req ExecuteRequest) (*exec.Cmd, error) {
	if h.cfg.Sandbox == "docker" {
		return h.buildDockerPythonCommand(ctx, tmpDir, codePath, req)
	}

	args := append([]string{codePath}, req.Args...)
	cmd := exec.CommandContext(ctx, h.cfg.PythonBin, args...)
	cmd.Dir = tmpDir
	return cmd, nil
}

func (h *Handler) buildDockerPythonCommand(ctx context.Context, tmpDir, codePath string, req ExecuteRequest) (*exec.Cmd, error) {
	// Mount the temp dir read-only into /work. Disable bytecode writes to avoid __pycache__.
	// Note: Docker Desktop on Windows expects host paths, so pass tmpDir directly.
	workDir := "/work"
	containerScript := workDir + "/" + filepath.Base(codePath)

	// Some Docker setups on Windows may require absolute paths; tmpDir already is.
	volumeArg := tmpDir + ":" + workDir + ":ro"

	args := []string{
		"run",
		"--rm",
		"--pull",
		"never",
		"--network",
		"none",
		"--pids-limit",
		"128",
		"--memory",
		"256m",
		"--cpus",
		"1",
		"--security-opt",
		"no-new-privileges",
		"--cap-drop",
		"ALL",
		"-w",
		workDir,
		"-v",
		volumeArg,
		"-e",
		"PYTHONDONTWRITEBYTECODE=1",
		h.cfg.DockerImage,
		"python",
		"-B",
		containerScript,
	}
	args = append(args, req.Args...)

	cmd := exec.CommandContext(ctx, h.cfg.DockerBin, args...)
	cmd.Dir = tmpDir

	// On Windows, ensure we don't accidentally try to run Windows containers.
	// This is a no-op hint; actual container mode is controlled by Docker Desktop.
	_ = runtime.GOOS

	return cmd, nil
}

func (h *Handler) streamStats(re *runEntry, stop <-chan struct{}) {
	t := time.NewTicker(250 * time.Millisecond)
	defer t.Stop()
	for {
		select {
		case <-t.C:
			h.publishStats(re)
		case <-stop:
			return
		}
	}
}

func (h *Handler) publishStats(re *runEntry) {
	snap := re.Snapshot()
	if snap.StartedAt == nil {
		return
	}
	elapsed := time.Since(snap.StartedAt.UTC()).Milliseconds()
	stdoutBytes := int64(len(snap.Stdout))
	stderrBytes := int64(len(snap.Stderr))
	at := time.Now().UTC().Format(time.RFC3339Nano)
	re.Publish(Event{
		Type:        "run.stats",
		RunID:       snap.ID,
		At:          &at,
		ElapsedMs:   &elapsed,
		StdoutBytes: &stdoutBytes,
		StderrBytes: &stderrBytes,
	})
}

func (h *Handler) streamPipe(re *runEntry, eventType string, r io.Reader, done chan<- struct{}) {
	defer func() { done <- struct{}{} }()
	br := bufio.NewReaderSize(r, 4096)
	buf := make([]byte, 4096)
	for {
		n, err := br.Read(buf)
		if n > 0 {
			chunk := append([]byte(nil), buf[:n]...)
			if eventType == "run.stdout" {
				re.AppendStdout(chunk)
			} else {
				re.AppendStderr(chunk)
			}
			re.Publish(Event{Type: eventType, RunID: re.run.ID, Data: string(chunk)})
		}
		if err != nil {
			return
		}
	}
}

func (h *Handler) finishWithError(re *runEntry, code string, err error) {
	finishedAt := time.Now().UTC()
	finishedAtStr := finishedAt.Format(time.RFC3339Nano)
	exit := -1
	msg := err.Error()

	re.Update(func(r *Run) {
		r.Status = RunFailed
		r.ExitCode = &exit
		r.ErrorCode = code
		r.ErrorMsg = msg
		r.FinishedAt = &finishedAt
	})
	re.Publish(Event{Type: "run.error", RunID: re.run.ID, Code: code, Message: msg})
	re.Publish(Event{Type: "run.finished", RunID: re.run.ID, ExitCode: &exit, At: &finishedAtStr})
}
