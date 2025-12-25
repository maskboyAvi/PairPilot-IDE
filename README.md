# PairPilot IDE

PairPilot IDE is a collaborative code editor (Monaco + Yjs) with Supabase-backed auth, presence, and rooms. It also includes an in-browser runner (Web Workers + Pyodide) so everyone in a room can see the same run output.

## Live link

- https://pairpilot.app

## Features

- **Realtime collaboration**: shared editing, cursors/selections, and a participant list
- **Rooms**: share a room link and code together
- **Roles**: everyone joins as viewer; the room owner can promote editors
- **Run code (shared output)**:
  - JavaScript runs inside a Web Worker
  - Python runs via Pyodide (WASM) inside a Web Worker
  - stdout/stderr + a small recent run history is shared to everyone in the room

## Tech stack

- Next.js (App Router) + React + TypeScript
- Monaco Editor (`@monaco-editor/react`)
- Yjs + `y-monaco` for CRDT-based shared editing
- Supabase:
  - Auth (sessions)
  - Realtime broadcast (transports Yjs updates + Awareness presence)

## Architecture

- The editor state lives in a Yjs document.
- Yjs document updates are broadcast via Supabase Realtime.
- Presence/cursors use Yjs Awareness updates over the same broadcast channel.
- “Run” executes on each client in a Web Worker.
  - Python loads Pyodide from a CDN on first run.

Important limitation: collaboration state is currently **ephemeral**. A room is “live” while at least one participant is connected.

## Repo structure

- [frontend/](frontend/) — Next.js app (UI + auth + collaboration + in-browser runner)
- [docs/](docs/) — architecture, deployment, and security notes
- [Learning/](Learning/) — engineering notes and implementation journal

## Local setup

### Prerequisites

- Node.js (LTS recommended)
- A Supabase project (Auth enabled)

### 1) Create a Supabase project

### 1) Create a Supabase project

In Supabase:

1. Create a new project
2. Enable Email auth (or whichever providers you want)
3. Ensure Realtime is available (broadcast is used for collaboration)

### 2) Configure environment variables

Create `frontend/.env.local` (start from `frontend/.env.example`):

```env
NEXT_PUBLIC_SUPABASE_URL=...
NEXT_PUBLIC_SUPABASE_ANON_KEY=...
```

### 3) Run locally

```bash
cd frontend
npm install
npm run dev
```

Open http://localhost:3000

## Scripts

From [frontend/](frontend/):

- `npm run dev` — start dev server
- `npm run build` — production build
- `npm run start` — run production build
- `npm run lint` — lint

## Deployment

This app is designed to deploy as “frontend only”.

- Deploy [frontend/](frontend/) to Vercel (or any Next.js-capable host)
- Add `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` in your hosting provider environment settings
- Optional: configure Upstash rate limiting + Sentry monitoring via env vars

Detailed steps: [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)

## Security notes / limitations

- **Code execution is not sandboxed server-side.** It runs in the browser and should be treated as a demo runner.
- Python uses Pyodide from a public CDN; the first run can take a few seconds.
- Collaboration state is not persisted yet.

## License

See [LICENSE](LICENSE).
