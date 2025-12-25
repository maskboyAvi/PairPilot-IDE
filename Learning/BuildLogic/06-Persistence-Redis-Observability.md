# 06 — Persistence + Redis + Observability

This is the first “big-tech” upgrade pass I did while still keeping PairPilot IDE deployable on a free tier.

The goal: keep the architecture “frontend + Supabase only” for collaboration, but add:

1. **Durable rooms** (Supabase Postgres persistence)
2. **Server-side guardrails** (Upstash Redis rate limiting)
3. **A real error trail** (observability)

---

## 1) Supabase persistence (Yjs snapshot)

### Why I did it

Realtime CRDT collaboration is great, but without persistence the room state disappears when everyone leaves.

So I store a **Yjs snapshot** for each room in Supabase Postgres.

### What I implemented

- A **single snapshot per room** in `room_snapshots.snapshot_b64`.
- The snapshot is `base64(Y.encodeStateAsUpdate(ydoc))`.

Code:

- Snapshot API: [frontend/src/app/api/rooms/[roomId]/snapshot/route.ts](../../frontend/src/app/api/rooms/%5BroomId%5D/snapshot/route.ts)
- Client hook: [frontend/src/components/collab/useRoomPersistence.ts](../../frontend/src/components/collab/useRoomPersistence.ts)

### How it works (runtime flow)

- When the editor mounts, I try to `GET /api/rooms/:roomId/snapshot`.
- If a snapshot exists, I apply it into the local Yjs doc (`Y.applyUpdate`).
- After the doc is synced/ready, I listen for Yjs `update` events and **debounce** saving.

This is “last write wins” snapshotting (simple + reliable).

---

## 2) Supabase RLS + joining rooms

### Why I did it

If I’m going to store state in Postgres, I want the database to enforce the access rules.

### What I implemented

I use 3 tables:

- `rooms` — the room metadata
- `room_members` — who is in the room and what role they have
- `room_snapshots` — the durable Yjs state

SQL is in:

- [docs/SUPABASE_SCHEMA.sql](../../docs/SUPABASE_SCHEMA.sql)

To make RLS work, I also added a “join” endpoint:

- [frontend/src/app/api/rooms/[roomId]/join/route.ts](../../frontend/src/app/api/rooms/%5BroomId%5D/join/route.ts)

The editor calls it on startup:

- It creates the room if it doesn’t exist.
- It creates my membership row if it doesn’t exist.

This ensures the subsequent snapshot `GET/POST` requests are authorized by RLS.

---

## 3) Upstash Redis rate limiting (Run)

### Why I did it

Even though code runs in the browser worker (so there’s no server execution bill), I still want:

- protection against spam clicking
- protection against accidental infinite loops “run, run, run”
- a place to add future guardrails (locks, quotas, abuse prevention)

### What I implemented

A server-side rate-limit endpoint:

- [frontend/src/app/api/ratelimit/run/route.ts](../../frontend/src/app/api/ratelimit/run/route.ts)

The client calls it **right before starting the worker**:

- [frontend/src/components/collab/useSharedRun.ts](../../frontend/src/components/collab/useSharedRun.ts)

Policy right now:

- `10 runs / 60s` per `(roomId, userId)`.

It’s intentionally **fail-open** (if Upstash is down or not configured, the IDE still works).

---

## 4) Observability (baseline)

### Why I did it

When I start deploying this (even on free tiers), I want to answer:

- “What errors are happening?”
- “Which routes are failing?”
- “What do users hit right before a crash?”

### What I implemented

I added Sentry config files:

- [frontend/sentry.client.config.ts](../../frontend/sentry.client.config.ts)
- [frontend/sentry.server.config.ts](../../frontend/sentry.server.config.ts)
- [frontend/sentry.edge.config.ts](../../frontend/sentry.edge.config.ts)

…and wrapped the Next config:

- [frontend/next.config.ts](../../frontend/next.config.ts)

Note: the repo uses a very new Next.js version, so I installed Sentry using `--legacy-peer-deps`. It builds fine, but if I ever hit weird tooling bugs, the first thing I’d try is aligning versions.

---

## Env vars I needed

### Supabase

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

### Upstash

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

### Sentry

- `SENTRY_DSN` (server)
- `NEXT_PUBLIC_SENTRY_DSN` (browser)

---

## Can Grafana dashboards be public later?

Yes, usually.

Two common approaches:

- **Public dashboards / share links** (Grafana Cloud and self-hosted often support this)
- **Dashboard snapshots** (static, safer for demos)

The big thing I’d watch: don’t expose anything sensitive (user IDs, room IDs, raw logs) if you’re sharing publicly.
