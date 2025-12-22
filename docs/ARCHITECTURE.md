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

## Collaboration flow

1. Client authenticates with Supabase Auth.
2. Client joins a Supabase Realtime channel for the room.
3. Yjs document updates are broadcast and applied by all participants.
4. Awareness updates (cursor/presence) are broadcast separately.
5. A lightweight “hello/sync” handshake is used so a new joiner can request a full Yjs update from an existing peer.

## Run flow

1. An editor clicks **Run**.
2. Code executes in a Web Worker.
   - JavaScript: evaluated in the worker
   - Python: Pyodide is loaded (first run) then executes
3. Worker posts stdout/stderr chunks back to the UI.
4. stdout/stderr and a small run history are stored in Yjs, so everyone sees the same output.

## Known limitations

- No persistence yet: rooms are ephemeral unless at least one participant is online.
- The runner is not a secure sandbox (it runs in the browser).
