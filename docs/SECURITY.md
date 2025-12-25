# Security model

## Scope

This project is a “frontend + Supabase” application. Collaboration and access control are enforced using Supabase Auth + Postgres Row Level Security (RLS). Code execution runs in the user’s browser.

## Key security properties

- Authentication is required to use the app.
- Room access and role changes are governed by database-backed membership and RLS.
- Runner output is treated as text (not HTML) to reduce XSS risk.

## What this project does NOT provide

- No server-side sandbox for code execution.
  - JavaScript and Python execution happens in the browser (Web Worker + Pyodide).
  - Treat the runner as a demo feature, not a hardened execution environment.

## Threat model (high level)

- Untrusted code execution: infinite loops, heavy computation, large outputs.
- Abuse: rapid repeated runs or automated spamming.
- Output injection risks if output is ever rendered as HTML.

## Controls

### Identity

- Supabase Auth provides user identity and session handling.

### Authorization

- Room membership and roles are stored in Postgres (`room_members`).
- Room snapshots are stored in Postgres (`room_snapshots`).
- Postgres RLS policies restrict reads/writes to authorized users.

### Runner safety

- Execution happens in a Web Worker (keeps UI responsive).
- Runs use a timeout and surface errors in stderr/output.

### Rate limiting (optional)

- If Upstash credentials are configured, `POST /api/ratelimit/run` enforces a per-user-per-room sliding window limit.
- If Upstash is not configured or unavailable, the rate limiter fails open to avoid breaking the app.

### Observability (optional)

- Sentry can be enabled for error monitoring (browser + server/edge).

## Limitations

- Browser execution cannot be treated as an isolation boundary.
- Persistence is snapshot-based, which is simple and reliable but not an append-only audit log.
