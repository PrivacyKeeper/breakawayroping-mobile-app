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

## The events this app covers

`src/constants/theme.ts` holds an `EVENTS` list, and it is the only place that
knows which events this app is about:

```ts
const EVENTS = [
  { code: "team_roping_header", label: "Heading", resultKind: "time" },
  { code: "team_roping_heeler", label: "Heeling", resultKind: "time" },
] as const;
```

Three things depend on getting this right.

**The codes are the database's, not the app's.** `app.eventType` is the app's
own slug and matches no row in `reference_options` — filtering on it returns an
empty set with no error, which renders as "the producer is not running your
event" at every rodeo in the list.

**The entries are not interchangeable.** Every app here but tie-down covers
more than one, and the first version reached for `eventCodes[0]` wherever a
code was needed. That filed a heeler's practice run and a heeler's video
analysis under the header's code, and collapsed ranch rodeo's ten events into
ranch bronc. Nothing errored; it was simply wrong in somebody's record months
later. So the practice log and the analyser ask which event, and
`src/lib/events.test.ts` fails the build if any module picks one by index.

**`resultKind` is per event, because it varies within a card.** Roughstock is
judged — two judges marking the horse and the rider out of 25 each, with the
eight seconds a pass/fail gate rather than the result — and everything else is
on the clock. Ranch rodeo is genuinely both. The form's label, its validation
range and the column written all follow it, so a bronc rider is asked for a
score and a roper for a time.

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

Four layers, because no single one is enough:

- `npm run typecheck` — types.
- `npm test` — the rule engine as pure functions, plus a schema guard that
  checks every column, filter and write in `queries.ts` against a snapshot
  of the live database. A select string is just a string; TypeScript
  cannot see inside one, and a wrong column is a 400 at runtime on one
  screen for every user.
- `npm test` also runs `test/queries.integration.test.mjs`, which drives
  the shipping data layer over real HTTP against a strict local
  PostgREST double. It refuses unknown columns the way PostgREST does.

- `npm run verify:live` — the real project. Everything above runs without
  touching production, which is what makes it runnable anywhere and also
  what it cannot prove: the real host, a real JWT, and RLS enforced
  server-side. This script is that hop. It creates a throwaway account,
  checks that sign-up provisions a contestant row, that RLS returns your own
  rows and refuses everybody else's, that a forged official run is rejected,
  and that the edge functions answer — then deletes the account. It needs a
  `.env` and network access to the project; it does not need a device.

What none of this proves is the UI on a handset, or push delivery, which
needs a real device token. Both wait for TestFlight.

## Before TestFlight

See `TESTFLIGHT.md`.
