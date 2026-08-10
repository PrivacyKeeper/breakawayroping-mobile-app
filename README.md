# Breakaway Roping — mobile app

The system of record for breakaway.

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
src/lib/pose/       On-device run analysis.
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

Sanctioning bodies that matter here: WPRA, PRCA, NLBRA, NHSRA, NIRA.

## Run analysis

The rider records a walk-around benchmark of herself and the horse
standing still, then films runs. Runs are measured as deviation from that
benchmark, on the phone. Only the numbers are uploaded; video stays on the
device unless it is explicitly shared.

See `AI_ANALYSIS.md` for what is wired and what still needs a model.
