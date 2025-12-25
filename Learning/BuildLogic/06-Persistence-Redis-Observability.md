# 06 — Persistence + Redis + Observability

This document describes the persistence, guardrails, and observability layers used by PairPilot IDE.

Goal: keep the architecture “frontend + Supabase only” for collaboration, while adding:

1. **Durable rooms** (Supabase Postgres persistence)
2. **Server-side guardrails** (Upstash Redis rate limiting)
3. **A real error trail** (observability)

---

## 1) Supabase persistence (Yjs snapshot)

Realtime CRDT collaboration benefits from persistence so the room state remains available after everyone disconnects.

PairPilot stores a **Yjs snapshot** for each room in Supabase Postgres.

### Implementation

- A **single snapshot per room** in `room_snapshots.snapshot_b64`.
- The snapshot is `base64(Y.encodeStateAsUpdate(ydoc))`.

Code:

- Snapshot API: [frontend/src/app/api/rooms/[roomId]/snapshot/route.ts](../../frontend/src/app/api/rooms/%5BroomId%5D/snapshot/route.ts)
- Client hook: [frontend/src/components/collab/useRoomPersistence.ts](../../frontend/src/components/collab/useRoomPersistence.ts)

### How it works (runtime flow)

- When the editor mounts, the client calls `GET /api/rooms/:roomId/snapshot`.
- If a snapshot exists, it is applied into the local Yjs doc (`Y.applyUpdate`).
- After the doc is ready, Yjs `update` events are observed and snapshot saves are debounced.

This is “last write wins” snapshotting (simple + reliable).

---

## 2) Supabase RLS + joining rooms

Postgres Row Level Security (RLS) enforces access rules for rooms, membership, and snapshots.

### Implementation

Tables:

- `rooms` — the room metadata
- `room_members` — who is in the room and what role they have
- `room_snapshots` — the durable Yjs state

SQL is in:

- [docs/SUPABASE_SCHEMA.sql](../../docs/SUPABASE_SCHEMA.sql)

To make RLS work cleanly, the app uses a “join” endpoint:

- [frontend/src/app/api/rooms/[roomId]/join/route.ts](../../frontend/src/app/api/rooms/%5BroomId%5D/join/route.ts)

The editor calls it on startup:

- It creates the room if it doesn’t exist.
- It creates my membership row if it doesn’t exist.

This ensures the subsequent snapshot `GET/POST` requests are authorized by RLS.

---

## 3) Upstash Redis rate limiting (Run)

Even though code runs in the browser worker, rate limiting helps reduce spam and accidental repeated runs.

- protection against spam clicking
- protection against accidental infinite loops “run, run, run”
- a place to add future guardrails (locks, quotas, abuse prevention)

### Implementation

A server-side rate-limit endpoint:

- [frontend/src/app/api/ratelimit/run/route.ts](../../frontend/src/app/api/ratelimit/run/route.ts)

The client calls it **right before starting the worker**:

- [frontend/src/components/collab/useSharedRun.ts](../../frontend/src/components/collab/useSharedRun.ts)

Policy right now:

- `3 runs / 60s` per `(roomId, userId)`.

It’s intentionally **fail-open** (if Upstash is down or not configured, the IDE still works).

---

## 4) Observability (baseline)

Sentry can be enabled to capture errors from both the browser and server/edge runtimes.

### Implementation

Sentry configuration:

- App Router initialization:
  - [frontend/src/instrumentation.ts](../../frontend/src/instrumentation.ts)
  - [frontend/src/instrumentation-client.ts](../../frontend/src/instrumentation-client.ts)
  - [frontend/src/app/global-error.tsx](../../frontend/src/app/global-error.tsx)
- Runtime config:
  - [frontend/sentry.server.config.ts](../../frontend/sentry.server.config.ts)
  - [frontend/sentry.edge.config.ts](../../frontend/sentry.edge.config.ts)
- Next.js build integration:
  - [frontend/next.config.ts](../../frontend/next.config.ts)

The Next.js config enables a Sentry tunnel route (`/monitoring`) to reduce ad-blocker interference.

---

## Environment variables

### Supabase

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Upstash

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

### Sentry

- `SENTRY_DSN` (server)
- `NEXT_PUBLIC_SENTRY_DSN` (browser)
