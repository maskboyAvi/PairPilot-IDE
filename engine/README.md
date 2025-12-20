# PairPilot IDE – Engine (MVP)

This service runs code and streams output.

Current state (MVP):

- Executes **Python locally** via `PYTHON_BIN` (default).
- Optional: executes inside a **Docker sandbox** via `ENGINE_SANDBOX=docker`.
- Produces a `runId` and streams `stdout`/`stderr` over WebSocket.
- Validates Supabase access tokens by calling `GET /auth/v1/user`.

Sandbox config:

- `ENGINE_SANDBOX=local|docker` (default: `local`)
- `DOCKER_BIN` (default: `docker`)
- `DOCKER_IMAGE` (default: `python:3.11-slim`)

## Run

1. Create `engine/.env` from `.env.example`

Note: the engine auto-loads `engine/.env` for local dev. (Go does not do this by default; we use `godotenv`.)

2. Start:

```bash
cd engine
go run ./cmd/engine
```

Health:

- `GET http://localhost:8080/health`

## API

- `POST /v1/execute` → `{ runId, status }`
- `GET /v1/runs/{runId}` → status
- `WS /v1/runs/{runId}/events?token=...` → events
