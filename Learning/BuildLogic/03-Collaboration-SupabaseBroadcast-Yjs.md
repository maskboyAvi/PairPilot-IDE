# 03) Collaboration: Supabase broadcast + Yjs

My goal was Google-Docs-style collaboration without running my own WebSocket server.

So I used:

- Yjs as the CRDT document
- `y-monaco` to bind Monaco ↔ Yjs
- Supabase Realtime broadcast as the transport layer

## How updates flow

- Each local edit produces a Yjs update (a `Uint8Array`).
- I base64-encode that update and broadcast it on the room channel.
- Remote clients decode and apply the update.

I do the same thing for presence:

- cursor/selection presence is handled by Yjs Awareness
- awareness updates are broadcast separately

## The “hello/sync” handshake

Because I’m not persisting the document yet, a brand-new client might join an empty room with no state.

To handle this, I implemented a simple handshake:

1. New joiner broadcasts `hello`.
2. Any existing peer responds with `sync` containing a full Yjs state update.
3. The joiner applies it and marks the room as synced.

This is intentionally lightweight and keeps the whole project serverless.

## What I learned / gotchas

- This architecture is great for demos and free-tier deploys, but it’s inherently ephemeral.
- If I want durable rooms, I need to persist Yjs snapshots/updates somewhere (Supabase Postgres is the obvious next step).
