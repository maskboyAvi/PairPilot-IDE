# 02) Rooms and roles

This document explains how rooms are identified and how permissions are enforced.

## Rooms

A room is identified by a `roomId` in the URL.

When a user opens a room page, the client:

- calls `POST /api/rooms/:roomId/join` to ensure membership exists
- joins a Supabase Realtime channel named `pairpilot:<roomId>`
- starts sending/receiving collaboration messages on that channel

## Roles

Roles are stored in Supabase Postgres and enforced by RLS.

Role model:

- Everyone joins as `viewer` by default.
- The room creator is `owner`.
- The owner can promote/demote users between `viewer` and `editor`.

Where roles live:

- `room_members.role` (`owner | editor | viewer`)

How roles change:

- Owner calls `POST /api/rooms/:roomId/members/role`.
- The API route verifies the caller is owner and relies on RLS as the final enforcement layer.

## Notes

- UI controls should reflect the current role, but authorization ultimately comes from Postgres RLS.
