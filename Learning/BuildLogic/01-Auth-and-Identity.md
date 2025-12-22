# 01) Auth and identity

I wanted the project to be dead simple to deploy, so I avoided running my own auth backend. I chose Supabase Auth because it gives me:

- hosted sign-up/sign-in
- sessions I can read on the server and in the browser
- an easy identity source for collaboration presence

## What I implemented

- Sign up / sign in pages in the Next.js app.
- A browser Supabase client for client-side actions.
- A server Supabase client for server actions.

## How I use identity in the app

In a room, I need a stable identifier and a friendly label:

- `userId`: I use the Supabase user id when available.
- `displayName`: I derive a short username (from metadata or email local-part).

That identity is what I attach to Yjs Awareness presence so other clients can show:

- who is connected
- cursor color and label

## What I learned / gotchas

- I keep the anon key on the client because that’s how Supabase is designed; real protection comes from RLS when you have tables.
- If I later persist documents, I’ll need an explicit room membership model with RLS.
