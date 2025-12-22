# Learning TODOs (non-trivial)

## Milestone 0 — Tooling + fundamentals

1. Install and verify: Node LTS + Git.
2. Explain back: CRDTs at a high level and what Yjs is doing for us.

## Milestone 1 — Supabase Auth

Your task:

- Configure Supabase Auth for local dev.
- Understand how Next.js server actions and the browser client read the session.

Explain back prompts:

- What data do I trust from the client vs from Supabase?
- Why do I keep `NEXT_PUBLIC_SUPABASE_ANON_KEY` public?

## Milestone 2 — Collaboration (no custom server)

Your task:

- Bind Monaco to a Yjs document.
- Transport Yjs updates over Supabase Realtime broadcast.
- Send Awareness updates for cursors/presence.

Explain back:

- What does “ephemeral rooms” mean in this architecture?
- Why do I need a “hello/sync” handshake when there’s no persistence?

## Milestone 3 — Runner (in browser)

Your task:

- Run JavaScript in a Web Worker.
- Run Python via Pyodide in a Web Worker.
- Make sure worker errors show up in stderr.

Explain back:

- Why a Worker (and not running on the main thread)?
- What are the security limits of browser execution?

## Milestone 4 — Deployment

Your task:

- Deploy the frontend (Vercel or similar).
- Configure Supabase env vars in production.

Explain back:

- What breaks if the room is empty and someone joins later?
