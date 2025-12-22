# 05) What I’d improve next

This is the list I keep for myself after getting the MVP working.

## Collaboration

- Add persistence so rooms don’t disappear when everyone leaves.
- Make the initial sync more reliable by storing a periodic snapshot.

## Roles / access control

- Move from “shared doc role map” to real authorization rules.
- If I add persistence, enforce room membership with Supabase RLS.

## Runner

- Improve JS runner ergonomics (async results, richer stack traces).
- Add nicer language presets/snippets.
- Consider a stronger sandbox later (only if I move execution server-side).

## Quality

- Add a small e2e test suite (collaboration + run flows).
- Improve observability around Realtime connection state.
