package main

import (
	"errors"
	"log"
	"net"
	"net/http"
	"os"
	"syscall"

	"github.com/joho/godotenv"

	"pairpilot/engine/internal/engine"
)

func main() {
	// Best-effort local dev convenience: load engine/.env when present.
	// In production, environment variables should be injected by the runtime.
	_ = godotenv.Load()

	cfg, err := engine.LoadConfigFromEnv()
	if err != nil {
		log.Fatalf("config error: %v", err)
	}

	h := engine.NewHandler(cfg)

	mux := http.NewServeMux()
	mux.HandleFunc("GET /health", h.Health)
	mux.HandleFunc("POST /v1/execute", h.Execute)
	mux.HandleFunc("GET /v1/runs/{runId}", h.GetRun)
	mux.HandleFunc("POST /v1/runs/{runId}/cancel", h.CancelRun)
	mux.HandleFunc("GET /v1/runs/{runId}/events", h.RunEventsWS)

	httpHandler := engine.WrapWithCORS(mux)

	addr := ":" + cfg.Port
	log.Printf("PairPilot engine listening on http://localhost%s", addr)
	log.Printf("Supabase user check: GET %s", cfg.SupabaseURL+"/auth/v1/user")
	if err := http.ListenAndServe(addr, httpHandler); err != nil {
		// Friendly dev message for a common Windows issue.
		var opErr *net.OpError
		if errors.As(err, &opErr) {
			var sysErr *os.SyscallError
			if errors.As(opErr.Err, &sysErr) && errors.Is(sysErr.Err, syscall.EADDRINUSE) {
				log.Printf("Port %s is already in use. Stop the other engine process or set PORT in engine/.env.", cfg.Port)
				os.Exit(1)
			}
		}

		log.Println(err)
		os.Exit(1)
	}
}
