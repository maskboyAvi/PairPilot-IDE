# Frontend

Next.js app (App Router) for PairPilot IDE.

Project overview and deployment docs:

- Root README: [../README.md](../README.md)
- Deployment: [../docs/DEPLOYMENT.md](../docs/DEPLOYMENT.md)

## Environment variables

1. Copy the template: `frontend/.env.example` → `frontend/.env.local`
2. Fill in the required Supabase values.

Required:

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

Optional:

- `UPSTASH_REDIS_REST_URL`, `UPSTASH_REDIS_REST_TOKEN` (rate limiting)
- `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_DSN` (Sentry)

## Local development

```bash
npm install
npm run dev
```

Open http://localhost:3000

## Production build

```bash
npm run build
npm run start
```

## Scripts

- `npm run dev`
- `npm run build`
- `npm run start`
- `npm run lint`
