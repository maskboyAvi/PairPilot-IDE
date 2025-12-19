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
