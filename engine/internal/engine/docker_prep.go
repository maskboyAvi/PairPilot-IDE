package engine

import (
	"bytes"
	"context"
	"errors"
	"fmt"
	"os/exec"
	"runtime"
	"strings"
	"time"
)

type dockerState struct {
	ready       bool
	lastAttempt time.Time
	initErr     error
}

func (h *Handler) ensureDockerImageReady(ctx context.Context, image string) error {
	h.dockerMu.Lock()
	defer h.dockerMu.Unlock()

	st, ok := h.dockerStates[image]
	if !ok {
		st = &dockerState{}
		h.dockerStates[image] = st
	}
	if st.ready {
		return nil
	}

	// Avoid hammering docker if multiple runs fail quickly.
	if st.initErr != nil && time.Since(st.lastAttempt) < 3*time.Second {
		return st.initErr
	}
	st.lastAttempt = time.Now()

	prepCtx, cancel := context.WithTimeout(ctx, 2*time.Minute)
	defer cancel()

	// Quick daemon check first (gives clearer errors than inspect/pull).
	checkCtx, checkCancel := context.WithTimeout(prepCtx, 5*time.Second)
	defer checkCancel()
	check := exec.CommandContext(checkCtx, h.cfg.DockerBin, "version")
	var checkOut bytes.Buffer
	check.Stdout = &checkOut
	check.Stderr = &checkOut
	if err := check.Run(); err != nil {
		msg := strings.TrimSpace(checkOut.String())
		// Common on Windows when Docker Desktop isn't running / Linux engine pipe missing.
		if runtime.GOOS == "windows" && (strings.Contains(msg, "dockerDesktopLinuxEngine") || strings.Contains(msg, "The system cannot find the file specified")) {
			st.initErr = fmt.Errorf(
				"Docker daemon not reachable. Start Docker Desktop and ensure Linux containers are enabled. (Details: %s)",
				msg,
			)
			return st.initErr
		}
		st.initErr = fmt.Errorf("Docker daemon not reachable (is Docker running?): %s", msg)
		return st.initErr
	}

	// Fast path: image already present.
	inspect := exec.CommandContext(prepCtx, h.cfg.DockerBin, "image", "inspect", image)
	if err := inspect.Run(); err == nil {
		st.ready = true
		st.initErr = nil
		return nil
	}

	// Pull with network enabled (we run containers with --network none).
	pull := exec.CommandContext(prepCtx, h.cfg.DockerBin, "pull", image)
	var out bytes.Buffer
	pull.Stdout = &out
	pull.Stderr = &out
	err := pull.Run()
	if err == nil {
		st.ready = true
		st.initErr = nil
		return nil
	}

	if errors.Is(prepCtx.Err(), context.DeadlineExceeded) {
		st.initErr = fmt.Errorf("docker pull timed out for %s; try running '%s pull %s' manually", image, h.cfg.DockerBin, image)
		return st.initErr
	}
	if errors.Is(prepCtx.Err(), context.Canceled) {
		st.initErr = fmt.Errorf("docker prep canceled")
		return st.initErr
	}

	st.initErr = fmt.Errorf("docker image not ready (%s): %w\n%s", image, err, out.String())
	return st.initErr
}
