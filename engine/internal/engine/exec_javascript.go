package engine

import (
	"context"
	"errors"
	"io"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"time"
)

func (h *Handler) runJavaScript(ctx context.Context, re *runEntry, req ExecuteRequest) {
	// Do not set StartedAt yet; Docker prep time should not count as execution time.
	re.Update(func(r *Run) {
		r.Status = RunRunning
	})

	tmpDir, err := os.MkdirTemp("", "pairpilot-run-*")
	if err != nil {
		h.finishWithError(re, "internal", err)
		return
	}
	defer os.RemoveAll(tmpDir)

	codePath := filepath.Join(tmpDir, "main.js")
	if err := os.WriteFile(codePath, []byte(req.Code), 0600); err != nil {
		h.finishWithError(re, "internal", err)
		return
	}

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

		if err := h.ensureDockerImageReady(ctx, h.cfg.DockerNodeImage); err != nil {
			h.finishWithError(re, "docker", err)
			return
		}

		prepMs := time.Since(prepStart).Milliseconds()
		re.Publish(Event{Type: "run.phase", RunID: re.run.ID, Phase: "ready", Message: "Docker sandbox ready", PrepMs: &prepMs})
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

	cmd, err := h.buildJavaScriptCommand(ctx, tmpDir, codePath, req)
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

	if err := cmd.Start(); err != nil {
		h.finishWithError(re, "internal", err)
		return
	}

	startedAt := time.Now().UTC()
	re.Update(func(r *Run) { r.StartedAt = &startedAt })
	startedAtStr := startedAt.Format(time.RFC3339Nano)
	re.Publish(Event{Type: "run.started", RunID: re.run.ID, At: &startedAtStr})

	statsStop := make(chan struct{})
	defer close(statsStop)
	go h.streamStats(re, statsStop)

	go func() {
		_, _ = io.WriteString(stdinPipe, req.Stdin)
		_ = stdinPipe.Close()
	}()

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

func (h *Handler) buildJavaScriptCommand(ctx context.Context, tmpDir, codePath string, req ExecuteRequest) (*exec.Cmd, error) {
	if h.cfg.Sandbox == "docker" {
		return h.buildDockerJavaScriptCommand(ctx, tmpDir, codePath, req)
	}

	args := append([]string{codePath}, req.Args...)
	cmd := exec.CommandContext(ctx, h.cfg.NodeBin, args...)
	cmd.Dir = tmpDir
	return cmd, nil
}

func (h *Handler) buildDockerJavaScriptCommand(ctx context.Context, tmpDir, codePath string, req ExecuteRequest) (*exec.Cmd, error) {
	workDir := "/work"
	containerScript := workDir + "/" + filepath.Base(codePath)
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
		h.cfg.DockerNodeImage,
		"node",
		containerScript,
	}
	args = append(args, req.Args...)

	cmd := exec.CommandContext(ctx, h.cfg.DockerBin, args...)
	cmd.Dir = tmpDir
	_ = runtime.GOOS
	return cmd, nil
}
