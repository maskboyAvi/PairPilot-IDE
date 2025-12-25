# 03) Collaboration: Supabase broadcast + Yjs

This document describes how realtime collaboration works without a custom WebSocket server.

Core building blocks:

- Yjs as the CRDT document
- `y-monaco` to bind Monaco ↔ Yjs
- Supabase Realtime broadcast as the transport layer

## How updates flow

- Each local edit produces a Yjs update (a `Uint8Array`).
- The client base64-encodes that update and broadcasts it on the room channel.
- Remote clients decode and apply the update.

The same approach is used for presence:

- cursor/selection presence is handled by Yjs Awareness
- awareness updates are broadcast separately

## The “hello/sync” handshake

Room state is persisted via snapshot, but a lightweight peer-to-peer handshake can still be useful as a fallback when a snapshot is unavailable.

Handshake flow:

1. New joiner broadcasts `hello`.
2. Any existing peer responds with `sync` containing a full Yjs state update.
3. The joiner applies it and marks the room as synced.

This is intentionally lightweight and keeps the whole project serverless.

## Snapshot-first startup

On room load:

1. The client calls `POST /api/rooms/:roomId/join` to ensure membership exists.
2. The client calls `GET /api/rooms/:roomId/snapshot` and applies the snapshot (if present).
3. The client joins `pairpilot:<roomId>` and begins exchanging realtime updates.
