# Security model (first draft)

## What I’m protecting (current)

- Users should only collaborate in rooms they know the link for.
- A room owner should be able to control who can edit.
- “Run” should not crash the app and should surface errors clearly.

## What I am NOT claiming (important)

- The runner is **not** a secure server-side sandbox.
- Code executes **in the browser**. Treat it as a demo runner.

## Threats I assume

- Untrusted code execution (malicious or accidental infinite loops)
- Abuse (spamming runs, huge outputs)
- XSS-style issues if I ever start rendering output as HTML (I currently treat output as text)

## Current controls

- Supabase Auth is required to join/use the app.
- Roles are enforced client-side using a shared Yjs-backed role map (owner can promote editors).
- Runs are executed in a Web Worker with a timeout.
- Worker errors are routed into stderr so failures are visible.

## Known gaps / next steps

- Persistence: rooms are ephemeral right now.
- Real authorization: if/when I persist docs, I’ll need proper RLS and room membership rules.
- Stronger sandboxing: if I ever move “Run” server-side, I’ll need real isolation and rate limiting.
