# API & Event Contracts (current)

This project is intentionally “frontend + Supabase only”. There is no custom collab server and no separate execution service.

This file documents the key “wire surfaces”:

1. HTTP API routes (Next.js Route Handlers)
2. Supabase Realtime broadcast events used for collaboration
3. Web Worker messages used for running code

## HTTP API routes

All routes require a logged-in Supabase user (cookie-based session).

### `POST /api/rooms/:roomId/join`

Ensures the caller is a member of the room, creating the room if needed.

Response:

```json
{ "ok": true, "role": "owner|editor|viewer", "ownerId": "<userId>|null" }
```

### `GET /api/rooms/:roomId/snapshot`

Loads the persisted Yjs snapshot (if present).

Response:

```json
{ "snapshotB64": "<base64>|null", "updatedAt": "<iso>|null" }
```

### `POST /api/rooms/:roomId/snapshot`

Saves the current Yjs snapshot.

Request:

```json
{ "snapshotB64": "<base64>" }
```

Response:

```json
{ "ok": true }
```

### `POST /api/rooms/:roomId/members/role`

Owner-only: changes a member’s role.

Request:

```json
{ "userId": "<targetUserId>", "role": "viewer|editor" }
```

Response:

```json
{ "ok": true }
```

### `POST /api/ratelimit/run`

Optional Upstash-backed rate limit check invoked before starting a run.

Request:

```json
{ "roomId": "<roomId>" }
```

Response (allowed):

```json
{
  "allowed": true,
  "limit": 3,
  "windowSec": 60,
  "remaining": 2,
  "reset": 1730000000000
}
```

Response (rate limited, HTTP 429):

```json
{
  "allowed": false,
  "limit": 3,
  "windowSec": 60,
  "remaining": 0,
  "reset": 1730000000000
}
```

## Supabase Realtime (broadcast)

Channel name pattern:

- `pairpilot:<roomId>`

Broadcast events are JSON payloads.

### `yjs-update`

Carries a Yjs document update.

Payload:

```json
{
  "update": "<base64 of Uint8Array>"
}
```

### `awareness-update`

Carries a Yjs Awareness update.

Payload:

```json
{
  "update": "<base64 of Uint8Array>"
}
```

### `hello` / `sync`

Used for initial “someone please send me the full state” syncing.

`hello` payload:

```json
{ "from": "<userId>", "nonce": "<random>" }
```

`sync` payload:

```json
{
  "to": "<userId>",
  "from": "<userId>",
  "update": "<base64 of Y.encodeStateAsUpdate(doc)>"
}
```

## Runner worker messages

The browser runner uses a Web Worker. Messages from the worker have shape:

```json
{ "type": "stdout|stderr|phase|error|finished", "...": "..." }
```

### `stdout` / `stderr`

```json
{ "type": "stdout", "data": "..." }
```

```json
{ "type": "stderr", "data": "..." }
```

### `phase`

```json
{
  "type": "phase",
  "phase": "idle|loading|running|finished|timeout|error|rate-limited",
  "message": "..."
}
```

### `error`

```json
{ "type": "error", "message": "..." }
```

### `finished`

```json
{ "type": "finished", "elapsedMs": 1234 }
```
