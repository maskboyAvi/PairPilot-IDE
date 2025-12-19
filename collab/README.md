# PairPilot IDE – Collab Server

This is a minimal WebSocket server for Yjs collaboration.

- Transport: `ws`
- Yjs protocol: `y-websocket` server utils
- Auth: validates Supabase access tokens via `GET /auth/v1/user`

## Run

1. Create `.env` from `.env.example`

You must set:

- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

2. Install deps:

```bash
npm install
```

3. Start dev server:

```bash
npm run dev
```

Default URL: `ws://localhost:1234`
