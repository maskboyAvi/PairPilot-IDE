# Deployment

This repo is designed to deploy as **frontend + Supabase only**.

## Recommended: Vercel

### 1) Create a Vercel project

- Import the GitHub repo into Vercel.
- In **Project Settings → General → Root Directory**, set it to `frontend`.

### 2) Environment variables

In **Project Settings → Environment Variables**, add:

**Required**

- `NEXT_PUBLIC_SUPABASE_URL`
- `NEXT_PUBLIC_SUPABASE_ANON_KEY`

**Optional (rate limiting)**

- `UPSTASH_REDIS_REST_URL`
- `UPSTASH_REDIS_REST_TOKEN`

**Optional (Sentry error monitoring)**

- `NEXT_PUBLIC_SENTRY_DSN`
- `SENTRY_DSN`

**Optional (Sentry readable stack traces / sourcemaps upload)**

- `SENTRY_AUTH_TOKEN`
- `SENTRY_ORG`
- `SENTRY_PROJECT`

### 3) Deploy

- Trigger a deployment.
- Visit the Vercel URL and test:
  - Login/signup
  - Create/join room
  - Run Python/JavaScript
  - Rate limit banner
  - Sentry example page (optional)

## Domain: pairpilot.app

In Vercel:

- **Project Settings → Domains** → add `pairpilot.app`
- Follow the DNS instructions Vercel gives you:
  - Usually an `A` record for apex domain (`pairpilot.app`) and
  - A `CNAME` for `www` (optional) pointing to Vercel.

## Notes

- Use `NEXT_PUBLIC_*` for anything needed by the browser bundle.
- Supabase RLS policies must be correct for production (rooms, roles, snapshots).
