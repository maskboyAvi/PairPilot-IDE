# PairPilot IDE

PairPilot IDE is a collaborative code editor (Monaco + Yjs) with Supabase-backed auth, presence, and rooms. It also includes an in-browser runner (Web Workers + Pyodide) so everyone in a room can see the same run output.
<div align="center">
  <img width="900" alt="image" src="https://github.com/user-attachments/assets/b70b8cad-a663-44ce-97b7-1585ac4a139d" />
</div>

## Live link
Check it out yourself : 
<a href="https://pairpilot.app" target="_blank" rel="noopener noreferrer">
  https://pairpilot.app
</a>

## Features

- **Realtime collaboration**: shared editing, cursors/selections, and a participant list
- **Rooms**: share a room link and code together
- **Roles**: everyone joins as viewer; the room owner can promote editors
- **Persistence**: room state is saved to Supabase Postgres (Yjs snapshot)
- **Run code (shared output)**:
  - JavaScript runs inside a Web Worker
  - Python runs via Pyodide (WASM) inside a Web Worker
  - stdout/stderr + a small recent run history is shared to everyone in the room

## Tech stack

- Next.js (App Router) + React + TypeScript
- Monaco Editor
- Yjs + `y-monaco` for CRDT-based shared editing
- Web Workers (in-browser runner)
- Pyodide (Python in the browser)
- Supabase:
  - Auth (sessions)
  - Realtime broadcast (transports Yjs updates + Awareness presence)
  - Postgres + RLS (rooms, room members/roles, snapshots)
- Upstash Redis + `@upstash/ratelimit`
- Sentry

### Feature videos

## 1. Realtime collaboration

<div align="center">
<video src="https://github.com/user-attachments/assets/a4e9d4cf-98f1-4efa-8c7b-46c940ce7c39" autoplay muted loop playsinline height="400"></video>
</div>

## 2. Roles

<div align="center">
<video src="https://github.com/user-attachments/assets/66d7796d-d4c9-40a5-b422-168edfc3ae5e" autoplay muted loop playsinline height="400"></video>
</div>

## 3. Run output (shared)

<div align="center">
<video src="https://github.com/user-attachments/assets/e124bf05-1f5b-4154-a8d7-db3944a7141b" autoplay muted loop playsinline height="400"></video>
</div>


## 4. Persistence (snapshot)

<div align="center">
<video src="https://github.com/user-attachments/assets/82d5c761-c315-4d08-b9e8-9a7b4d2b8937" autoplay muted loop playsinline height="400"></video>
</div>

## Architecture

- The editor state lives in a Yjs document.
- Yjs document updates are broadcast via Supabase Realtime.
- Presence/cursors use Yjs Awareness updates over the same broadcast channel.
- On room load, a persisted snapshot is loaded from Supabase Postgres (if available) and applied to the Yjs document.
- The client periodically saves a fresh snapshot back to Supabase.
- “Run” executes on each client in a Web Worker.
  - Python loads Pyodide from a CDN on first run.

Notes:

- “Run” is a browser runner (no server-side sandbox).
- Persistence is snapshot-based (simple and reliable for this architecture).

## Repo structure

- [frontend/](frontend/) — Next.js app (UI + auth + collaboration + in-browser runner)
- [docs/](docs/) — architecture, deployment, and security notes
- [Learning/](Learning/) — engineering notes and implementation journal

## Local setup

### Prerequisites

- Node.js (LTS recommended)
- A Supabase project (Auth enabled)

### 1) Create a Supabase project

In Supabase:

1. Create a new project
2. Enable Email auth
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

## License

See [LICENSE](LICENSE).
