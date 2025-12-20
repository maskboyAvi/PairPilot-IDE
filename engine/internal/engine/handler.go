package engine

import (
	"context"
	"encoding/json"
	"log"
	"net/http"
	"sync"
	"time"

	"github.com/gorilla/websocket"
)

type Handler struct {
	cfg          Config
	runs         *RunManager
	httpClient   *http.Client
	dockerMu     sync.Mutex
	dockerStates map[string]*dockerState
}

func NewHandler(cfg Config) *Handler {
	return &Handler{
		cfg:  cfg,
		runs: NewRunManager(),
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
		dockerStates: map[string]*dockerState{},
	}
}

func (h *Handler) Health(w http.ResponseWriter, _ *http.Request) {
	writeJSON(w, http.StatusOK, map[string]any{"ok": true})
}

func (h *Handler) Execute(w http.ResponseWriter, r *http.Request) {
	_, err := h.authHTTP(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
		return
	}

	var req ExecuteRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		writeError(w, http.StatusBadRequest, "invalid_request", "Invalid JSON")
		return
	}

	if req.Language == "" || req.Code == "" {
		writeError(w, http.StatusBadRequest, "invalid_request", "language and code are required")
		return
	}

	switch req.Language {
	case "python", "javascript":
		// ok
	default:
		writeError(w, http.StatusBadRequest, "invalid_request", "supported languages: python, javascript")
		return
	}

	re := h.runs.NewRun()
	writeJSON(w, http.StatusAccepted, ExecuteResponse{RunID: re.run.ID, Status: string(RunQueued)})

	go func() {
		ctx, cancel := context.WithCancel(context.Background())
		re.SetCancel(cancel)
		defer re.SetCancel(nil)
		switch req.Language {
		case "python":
			h.runPython(ctx, re, req)
		case "javascript":
			h.runJavaScript(ctx, re, req)
		default:
			h.finishWithError(re, "invalid_request", context.Canceled)
		}
	}()
}

func (h *Handler) CancelRun(w http.ResponseWriter, r *http.Request) {
	_, err := h.authHTTP(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
		return
	}

	runID := r.PathValue("runId")
	re, ok := h.runs.Get(runID)
	if !ok {
		writeError(w, http.StatusNotFound, "invalid_request", "run not found")
		return
	}

	if !re.Cancel() {
		writeError(w, http.StatusConflict, "invalid_request", "run is not cancelable")
		return
	}

	re.Publish(Event{Type: "run.phase", RunID: runID, Phase: "canceling", Message: "Cancel requested"})
	writeJSON(w, http.StatusAccepted, map[string]any{"ok": true})
}

func (h *Handler) GetRun(w http.ResponseWriter, r *http.Request) {
	_, err := h.authHTTP(r)
	if err != nil {
		writeError(w, http.StatusUnauthorized, "unauthorized", "Unauthorized")
		return
	}

	runID := r.PathValue("runId")
	re, ok := h.runs.Get(runID)
	if !ok {
		writeError(w, http.StatusNotFound, "invalid_request", "run not found")
		return
	}

	snap := re.Snapshot()
	writeJSON(w, http.StatusOK, RunStateResponse{
		RunID:      snap.ID,
		Status:     snap.Status,
		ExitCode:   snap.ExitCode,
		StartedAt:  snap.StartedAt,
		FinishedAt: snap.FinishedAt,
	})
}

var upgrader = websocket.Upgrader{
	CheckOrigin: func(_ *http.Request) bool { return true },
}

func (h *Handler) RunEventsWS(w http.ResponseWriter, r *http.Request) {
	_, err := h.authWS(r)
	if err != nil {
		w.WriteHeader(http.StatusUnauthorized)
		return
	}

	runID := r.PathValue("runId")
	re, ok := h.runs.Get(runID)
	if !ok {
		w.WriteHeader(http.StatusNotFound)
		return
	}

	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()

	ctx, cancel := context.WithCancel(r.Context())
	defer cancel()

	// Send a simple snapshot first so a late-joiner sees something.
	snap := re.Snapshot()
	if snap.StartedAt != nil {
		at := snap.StartedAt.UTC().Format(time.RFC3339Nano)
		_ = conn.WriteJSON(Event{Type: "run.started", RunID: runID, At: &at})
		elapsed := time.Since(snap.StartedAt.UTC()).Milliseconds()
		stdoutBytes := int64(len(snap.Stdout))
		stderrBytes := int64(len(snap.Stderr))
		at2 := time.Now().UTC().Format(time.RFC3339Nano)
		_ = conn.WriteJSON(Event{Type: "run.stats", RunID: runID, At: &at2, ElapsedMs: &elapsed, StdoutBytes: &stdoutBytes, StderrBytes: &stderrBytes})
	}
	if len(snap.Stdout) > 0 {
		_ = conn.WriteJSON(Event{Type: "run.stdout", RunID: runID, Data: string(snap.Stdout)})
	}
	if len(snap.Stderr) > 0 {
		_ = conn.WriteJSON(Event{Type: "run.stderr", RunID: runID, Data: string(snap.Stderr)})
	}
	if snap.FinishedAt != nil {
		if snap.ErrorMsg != "" {
			_ = conn.WriteJSON(Event{Type: "run.error", RunID: runID, Code: snap.ErrorCode, Message: snap.ErrorMsg})
		}
		at := snap.FinishedAt.UTC().Format(time.RFC3339Nano)
		_ = conn.WriteJSON(Event{Type: "run.finished", RunID: runID, ExitCode: snap.ExitCode, At: &at})
		return
	}

	sub := re.Subscribe(ctx)
	for evt := range sub {
		if err := conn.WriteJSON(evt); err != nil {
			log.Printf("ws write error: %v", err)
			return
		}
	}
}

func writeJSON(w http.ResponseWriter, status int, v any) {
	w.Header().Set("content-type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(v)
}

type apiError struct {
	Error struct {
		Code    string `json:"code"`
		Message string `json:"message"`
	} `json:"error"`
}

func writeError(w http.ResponseWriter, status int, code, message string) {
	var e apiError
	e.Error.Code = code
	e.Error.Message = message
	writeJSON(w, status, e)
}
