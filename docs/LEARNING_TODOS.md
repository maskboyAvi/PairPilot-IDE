# Learning path

This document outlines a structured way to understand and extend the project.

## Milestone 0 — Tooling + fundamentals

1. Install Node.js (LTS) and Git.
2. Review the core collaboration model:
   - CRDT basics
   - Yjs document updates
   - Awareness (presence)

## Milestone 1 — Authentication (Supabase)

1. Create a Supabase project.
2. Configure environment variables in `frontend/.env.local`.
3. Verify the app can:
   - sign up
   - sign in
   - restore a session on refresh

## Milestone 2 — Rooms, roles, and persistence

1. Review the database schema in `docs/SUPABASE_SCHEMA.sql`.
2. Understand the room join flow:
   - `POST /api/rooms/:roomId/join`
   - membership rows in `room_members`
3. Understand persistence:
   - snapshot load: `GET /api/rooms/:roomId/snapshot`
   - snapshot save: `POST /api/rooms/:roomId/snapshot`

## Milestone 3 — Collaboration transport (Realtime)

1. Understand the room channel naming: `pairpilot:<roomId>`.
2. Review broadcast events:
   - `yjs-update`
   - `awareness-update`
3. Review the initial sync behavior (snapshot-first, then realtime updates).

## Milestone 4 — Runner (in browser)

1. JavaScript execution in a Web Worker.
2. Python execution via Pyodide in a Web Worker.
3. Shared run state:
   - stdout/stderr and run history are shared through Yjs

## Milestone 5 — Guardrails and observability (optional)

1. Rate limiting:
   - `POST /api/ratelimit/run` (Upstash)
2. Observability:
   - Sentry setup for browser + server/edge

## Milestone 6 — Deployment

1. Deploy to Vercel with `frontend` as the root directory.
2. Configure required environment variables.
