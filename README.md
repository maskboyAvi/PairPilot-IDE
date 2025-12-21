# PairPilot IDE

Goal: a Google-Docs-style collaborative code editor (Monaco + Yjs) that can run code in isolated containers with live CPU/RAM telemetry.

## Repo layout

- `frontend/` Next.js app (UI + auth)
- `collab/` WebSocket server for Yjs sync + awareness (JWT protected)
- `engine/` Go service that runs code in Docker and streams logs + stats (JWT protected)
- `infra/` docker-compose + nginx reverse proxy + deployment notes
- `docs/` architecture, security model, API/event contracts

## How we’ll work (important)

We build in small milestones and learn as we go:

1. implement a thin slice
2. verify demo
3. explain what we did (you explain back, I’ll prompt)

Start here: `docs/LEARNING_TODOS.md`.

Build journal: [Learning/BuildLogic/README.md](Learning/BuildLogic/README.md)

## Dev startup (Windows)

You run 3 services:

1. Collab server (Yjs WebSocket) – default `ws://localhost:1234`
2. Engine (code execution API) – default `http://localhost:8080`
3. Frontend (Next.js) – default `http://localhost:3000`

### One-time setup

- Create env files:
  - `collab/.env` from `collab/.env.example`
  - `engine/.env` from `engine/.env.example`
  - `frontend/.env.local` (see `frontend/README.md`)

### Run (recommended)

Use VS Code tasks:

- `dev:all` (starts everything)
- `dev:collab`
- `dev:engine`
- `dev:frontend`

Or run the PowerShell launcher:

- `pwsh ./scripts/dev.ps1`

If you see "port already in use", stop the previous process or change `PORT` in the corresponding `.env`.
