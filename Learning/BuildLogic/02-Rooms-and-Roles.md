# 02) Rooms and roles

I wanted a “share a link and start coding” flow.

My constraints:

- no database persistence yet
- no separate collab server
- still need basic access control (viewer vs editor)

## Rooms

A room is identified by a `roomId` in the URL.

When a user opens a room page, the client:

- joins a Supabase Realtime channel named `pairpilot:<roomId>`
- starts sending/receiving collaboration messages on that channel

## Roles

I implemented a simple model:

- Everyone joins as a viewer.
- The first person in the room becomes the owner.
- The owner can promote other users to editor.

Where roles live:

- I store `ownerId` and a `roles` map inside the shared Yjs document.

That has a nice property for the MVP:

- roles sync to everyone instantly without building a backend.

## What I learned / gotchas

- This is not “secure authorization” in the backend sense — it’s a shared state agreement.
- If/when I add persistence, I’ll move owner/role enforcement into the database with RLS.
