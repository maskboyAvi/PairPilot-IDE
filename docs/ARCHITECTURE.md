# Architecture

## Components

- **Next.js (frontend)**
  - UI, routing, and auth flows
  - Monaco editor + Yjs document
  - Collaboration transport via Supabase Realtime broadcast
  - In-browser runner (Web Worker)
- **Supabase**
  - Auth (sessions)
  - Realtime broadcast (fanout for Yjs + Awareness messages)
  - Postgres + RLS (rooms, room membership/roles, snapshots)

Optional services:

- **Upstash Redis**
  - Server-side rate limiting for the Run button (`POST /api/ratelimit/run`)
- **Sentry**
  - Error monitoring for Next.js (browser + server/edge)

## Collaboration flow

1. Client authenticates with Supabase Auth.
2. Client ensures membership exists by calling `POST /api/rooms/:roomId/join`.
3. Client loads a persisted snapshot (if available) via `GET /api/rooms/:roomId/snapshot` and applies it to the Yjs doc.
4. Client joins a Supabase Realtime channel for the room (`pairpilot:<roomId>`).
5. Yjs document updates are broadcast and applied by all participants.
6. Awareness updates (cursor/presence) are broadcast separately.

Notes:

- A lightweight peer-to-peer “hello/sync” handshake may still be used as a fallback when a snapshot is not available.

## Run flow

1. An editor clicks **Run**.
2. Client optionally calls `POST /api/ratelimit/run` (Upstash) to enforce rate limits.
3. Code executes in a Web Worker.
   - JavaScript: evaluated in the worker
   - Python: Pyodide is loaded (first run) then executes
4. Worker posts stdout/stderr chunks back to the UI.
5. stdout/stderr and a small run history are stored in Yjs, so everyone sees the same output.

## Known limitations

- Persistence is snapshot-based (periodic snapshots to Postgres), not an event log.
- The runner is not a secure sandbox (it runs in the browser).
