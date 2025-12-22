# API & Event Contracts (current)

This project is intentionally “frontend + Supabase only”. There is no custom collab server and no separate execution service.

This file documents the two “wire surfaces” that matter:

1. Supabase Realtime broadcast events used for collaboration
2. Web Worker messages used for running code

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
  "phase": "loading|running|finished|timeout|error",
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
