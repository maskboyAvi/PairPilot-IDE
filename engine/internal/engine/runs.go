package engine

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"sync"
	"time"

	"github.com/oklog/ulid/v2"
)

type RunManager struct {
	mu   sync.RWMutex
	runs map[string]*runEntry
}

type runEntry struct {
	run *Run
	mu  sync.Mutex

	cancelMu sync.Mutex
	cancel   context.CancelFunc

	subsMu sync.Mutex
	subs   map[chan Event]struct{}
}

func NewRunManager() *RunManager {
	return &RunManager{runs: map[string]*runEntry{}}
}

func (m *RunManager) NewRun() *runEntry {
	now := time.Now().UTC()

	runID := newRunID(now)
	re := &runEntry{
		run: &Run{
			ID:     runID,
			Status: RunQueued,
		},
		subs: map[chan Event]struct{}{},
	}

	m.mu.Lock()
	m.runs[runID] = re
	m.mu.Unlock()

	return re
}

func (m *RunManager) Get(runID string) (*runEntry, bool) {
	m.mu.RLock()
	re, ok := m.runs[runID]
	m.mu.RUnlock()
	return re, ok
}

func (re *runEntry) Snapshot() Run {
	re.mu.Lock()
	defer re.mu.Unlock()
	cp := *re.run
	cp.Stdout = append([]byte(nil), re.run.Stdout...)
	cp.Stderr = append([]byte(nil), re.run.Stderr...)
	return cp
}

func (re *runEntry) Update(fn func(r *Run)) {
	re.mu.Lock()
	fn(re.run)
	re.mu.Unlock()
}

func (re *runEntry) AppendStdout(b []byte) {
	re.mu.Lock()
	re.run.Stdout = append(re.run.Stdout, b...)
	re.mu.Unlock()
}

func (re *runEntry) AppendStderr(b []byte) {
	re.mu.Lock()
	re.run.Stderr = append(re.run.Stderr, b...)
	re.mu.Unlock()
}

func (re *runEntry) Subscribe(ctx context.Context) <-chan Event {
	ch := make(chan Event, 32)

	re.subsMu.Lock()
	re.subs[ch] = struct{}{}
	re.subsMu.Unlock()

	go func() {
		<-ctx.Done()
		re.subsMu.Lock()
		delete(re.subs, ch)
		re.subsMu.Unlock()
		close(ch)
	}()

	return ch
}

func (re *runEntry) Publish(evt Event) {
	re.subsMu.Lock()
	for ch := range re.subs {
		select {
		case ch <- evt:
		default:
			// drop if subscriber is slow
		}
	}
	re.subsMu.Unlock()
}

func (re *runEntry) SetCancel(cancel context.CancelFunc) {
	re.cancelMu.Lock()
	re.cancel = cancel
	re.cancelMu.Unlock()
}

func (re *runEntry) Cancel() bool {
	re.cancelMu.Lock()
	c := re.cancel
	re.cancelMu.Unlock()
	if c == nil {
		return false
	}
	c()
	return true
}

func newRunID(now time.Time) string {
	e := ulid.Monotonic(rand.Reader, 0)
	id := ulid.MustNew(ulid.Timestamp(now), e)
	return "run_" + id.String()
}

func shortRandHex(n int) string {
	buf := make([]byte, n)
	_, _ = rand.Read(buf)
	return hex.EncodeToString(buf)
}
