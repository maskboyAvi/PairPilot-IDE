# PairPilot IDE

PairPilot IDE is a Google-Docs-style collaborative code editor built with Monaco + Yjs, with Supabase Auth and presence. It also includes a deployment-friendly **Run** button that executes code **in the browser** (Web Workers + Pyodide).

I originally prototyped this as a multi-service system, then intentionally simplified it to a **frontend + Supabase** architecture so it’s easy to deploy and demo without running any servers.

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

## Architecture (current)

- The editor state lives in a Yjs document.
- Yjs document updates are broadcast via Supabase Realtime.
- Presence/cursors use Yjs Awareness updates over the same broadcast channel.
- “Run” executes on each client in a Web Worker.
  - Python loads Pyodide from a CDN on first run.

Important limitation: collaboration state is **ephemeral** right now. A room is “live” while at least one participant is connected. There’s no persistence layer yet.

## Repo structure

- [frontend/](frontend/) — Next.js app (UI + auth + collaboration + in-browser runner)
- [docs/](docs/) — short architecture + security notes
- [Learning/](Learning/) — my build notes and implementation journal

## Getting started (Windows)

### 1) Create a Supabase project

In Supabase:

1. Create a new project
2. Enable Email auth (or whichever providers you want)
3. Ensure Realtime is available (broadcast is used for collaboration)

### 2) Configure environment variables

Create `frontend/.env.local`:

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
- Add the same `NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY` in your hosting provider environment settings

## Security notes / limitations

- **Code execution is not sandboxed server-side.** It runs in the browser and should be treated as a demo runner.
- Python uses Pyodide from a public CDN; the first run can take a few seconds.
- Collaboration state is not persisted yet.

## Roadmap

- Persist room documents (Yjs snapshots/updates) into Supabase Postgres
- Add basic e2e tests for collaboration flows
- Improve runner UX (better errors, better cancellation, richer run history)

## License

See [LICENSE](LICENSE).
