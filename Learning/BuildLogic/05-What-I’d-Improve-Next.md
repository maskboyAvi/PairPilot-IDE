# 05) Extension ideas

This document lists potential areas to extend or harden the project.

## Collaboration

- Improve conflict handling for concurrent snapshot saves (e.g., stronger merge strategy or update log).
- Add visibility into sync status (snapshot loaded, realtime connected, peer sync fallback).

## Roles / access control

- Add admin UX for membership management (invite/remove members, transfer ownership).
- Expand role model if needed (e.g., read-only rooms or time-limited access).

## Runner

- Improve JavaScript runner ergonomics (async evaluation, richer error formatting).
- Add language presets/snippets.
- Add stronger isolation only if execution is ever moved server-side.

## Quality

- Add end-to-end tests for auth, room join, collaboration, and run flows.
- Add monitoring around Realtime connectivity and snapshot persistence.
