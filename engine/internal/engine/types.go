package engine

import "time"

type ExecuteRequest struct {
	Language  string   `json:"language"`
	Code      string   `json:"code"`
	Stdin     string   `json:"stdin"`
	Args      []string `json:"args"`
	TimeoutMs int      `json:"timeoutMs"`
}

type ExecuteResponse struct {
	RunID  string `json:"runId"`
	Status string `json:"status"`
}

type RunStatus string

const (
	RunQueued   RunStatus = "queued"
	RunRunning  RunStatus = "running"
	RunFinished RunStatus = "finished"
	RunFailed   RunStatus = "failed"
	RunTimeout  RunStatus = "timeout"
	RunCanceled RunStatus = "canceled"
)

type Run struct {
	ID         string
	Status     RunStatus
	ExitCode   *int
	ErrorCode  string
	ErrorMsg   string
	StartedAt  *time.Time
	FinishedAt *time.Time
	Stdout     []byte
	Stderr     []byte
}

type RunStateResponse struct {
	RunID      string     `json:"runId"`
	Status     RunStatus  `json:"status"`
	ExitCode   *int       `json:"exitCode"`
	StartedAt  *time.Time `json:"startedAt"`
	FinishedAt *time.Time `json:"finishedAt"`
}

type Event struct {
	Type        string   `json:"type"`
	RunID       string   `json:"runId"`
	At          *string  `json:"at,omitempty"`
	Phase       string   `json:"phase,omitempty"`
	Data        string   `json:"data,omitempty"`
	ExitCode    *int     `json:"exitCode,omitempty"`
	Code        string   `json:"code,omitempty"`
	Message     string   `json:"message,omitempty"`
	PrepMs      *int64   `json:"prepMs,omitempty"`
	ElapsedMs   *int64   `json:"elapsedMs,omitempty"`
	StdoutBytes *int64   `json:"stdoutBytes,omitempty"`
	StderrBytes *int64   `json:"stderrBytes,omitempty"`
	CPUPercent  *float64 `json:"cpuPercent,omitempty"`
	MemoryBytes *int64   `json:"memoryBytes,omitempty"`
}
