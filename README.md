# Breakaway Roping — mobile app

The fastest event in rodeo, measured against your own body.

Companion app for [breakawayroping.pro](https://www.breakawayroping.pro). Expo + expo-router,
Supabase, TypeScript.

## Running it

```bash
npm install
cp .env.example .env      # fill in the Supabase URL and anon key
npx expo start
```

```bash
npm run typecheck
npm test                  # rule engine tests, no device needed
```

## Layout

```
src/app/            expo-router routes. Thin — each one renders a screen.
src/screens/        Screen components, one folder each.
src/components/ui/  Shared UI.
src/lib/scoring/    THE RULE ENGINE. Pure functions, unit tested.
src/lib/pose/       On-device analysis engine (no pose model wired yet).
src/lib/analysis.ts Video run analysis via the analyse-run Edge Function.
src/lib/auth.tsx    Session, sign in/up/out, account deletion.
src/lib/queries.ts  Every read and write, in one file.
src/lib/push.ts     Device registration for draw notifications.
test/               Integration tests against a local PostgREST double.
src/constants/      Theme and app identity.
supabase/migrations/
src/constants/      Theme and app identity.
supabase/migrations/
```

## The rule engine

`src/lib/scoring/` is the part that must not be hand-waved — it decides
whether a run counts and what it pays. It is pure functions over
configuration data: no database, no network, no clock, no randomness, so
it is exhaustively testable and runs identically on the phone and the
server.

**Every rule is data.** Penalty seconds, loop counts, catch legality,
time limits and association variations are all loaded from a rules
profile bound to a dated rule set. A sanctioning body changing a rule
mid-season is a new profile, never a deploy. Rodeo rules change annually
and mid-season; code that hardcodes them is wrong by October.

Sanctioning bodies that matter here: PRCA, NIRA, NHSRA.

## Run analysis

Pick a clip of one run. The app extracts twelve keyframes, uploads only
those, and a vision model returns a structured breakdown — a mark per
phase, coded faults with evidence, key moments. The video never leaves the
phone.

The model chooses fault codes from this event's own fixed taxonomy; it
cannot invent a category. That is what makes a coach report countable.

See `AI_ANALYSIS.md` for how it works, and for the separate on-device pose
path that is built but still needs a model.

## What is verified, and how

Three layers, because no single one is enough:

- `npm run typecheck` — types.
- `npm test` — the rule engine as pure functions, plus a schema guard that
  checks every column, filter and write in `queries.ts` against a snapshot
  of the live database. A select string is just a string; TypeScript
  cannot see inside one, and a wrong column is a 400 at runtime on one
  screen for every user.
- `npm test` also runs `test/queries.integration.test.mjs`, which drives
  the shipping data layer over real HTTP against a strict local
  PostgREST double. It refuses unknown columns the way PostgREST does.

What none of this proves is the real network hop with a real JWT and RLS
enforced live. That needs a device or an unblocked host.

## Before TestFlight

See `TESTFLIGHT.md`.
