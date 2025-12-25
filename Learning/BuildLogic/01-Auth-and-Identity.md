# 01) Auth and identity

PairPilot IDE uses Supabase Auth so the app can run without a custom backend while still providing user identity for rooms, presence, and permissions.

## Implementation

- Sign up / sign in pages in the Next.js app.
- A browser Supabase client for client-side actions.
- A server Supabase client for API routes.

## Identity usage

In a room, the UI needs a stable identifier and a friendly label:

- `userId`: the Supabase user id.
- `displayName`: a derived short username (metadata or email local-part).

That identity is attached to Yjs Awareness presence so other clients can show:

- who is connected
- cursor color and label

## Notes

- The anon key is public by design; access control comes from Postgres RLS.
- Membership and roles are stored in Postgres (`room_members`) and enforced by RLS.
