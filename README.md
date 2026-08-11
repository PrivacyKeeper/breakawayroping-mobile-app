# App generator toolchain — recovery branch

**This branch is a carrier, not part of the Breakaway app. It has served its
purpose — all seven apps are pushed. Safe to delete.**

## Why it exists

Seven event apps were built in one session. Partway through, the session's
repository-attach service started dropping, and three apps were finished but
could not be pushed — so this toolchain was committed as insurance against
losing them with the container. The service recovered and all seven landed.
Kept only because the branch could not be deleted through the git proxy.

All seven are on `claude/build-apps-from-websites-4xhq0c` in their own repos:

| App | Branch |
|---|---|
| breakawayroping-mobile-app | `claude/build-apps-from-websites-4xhq0c` ✅ |
| tiedown-mobile-app | `claude/build-apps-from-websites-4xhq0c` ✅ |
| teamrope-mobile-app | `claude/build-apps-from-websites-4xhq0c` ✅ |
| bulldogging-mobile-app | `claude/build-apps-from-websites-4xhq0c` ✅ |
| saddlebronc-mobile-app | `claude/build-apps-from-websites-4xhq0c` ✅ |
| barebackbronc-mobile-app | `claude/build-apps-from-websites-4xhq0c` ✅ |
| ranchrodeo-mobile-app | `claude/build-apps-from-websites-4xhq0c` ✅ |

## Regenerating any app from scratch

```bash
git clone https://github.com/PrivacyKeeper/breakawayroping-mobile-app
cd breakawayroping-mobile-app
git checkout claude/app-generator-toolchain

# Regenerate all seven app trees into ./out
OUT_ROOT=$PWD/out node gen/generate.js
OUT_ROOT=$PWD/out node gen/migrations.js
OUT_ROOT=$PWD/out SHARED=$PWD/shared bash gen/assemble.sh

# Verify — every app's rule engine runs with no install and no device
for d in out/*-mobile-app; do (cd "$d" && node --test "src/**/*.test.ts"); done
```

Expected: 71 passing, 0 failing across the seven.

`gen/commit.sh` holds the commit message written for each app.

Note: `generate.js` emits a generic `001_core_identity_and_analysis.sql`.
Breakaway already has identity, safety and rule-versioning live in Supabase
from migrations 001–006, so for that app only, the generic 001 is dropped and
the analysis half is renumbered 010 with the event layer at 011. The other six
take 001 and 002 as generated. That is already reflected in what was pushed.

## What is in here

```
gen/apps.config.js   Per-app identity, palette, tabs. Palettes were read out
                     of each shipped website's CSS, not from the spine doc —
                     where they disagree the live site wins.
gen/generate.js      Scaffold: build config, theme, router, tabs, screens
gen/migrations.js    Supabase migrations, core + per-event layer
gen/assemble.sh      Copies the engines below into each generated app
gen/commit.sh        Per-app commit messages

shared/scoring-core/         The RunOutcome interface every engine implements
shared/scoring-breakaway/    WPRA/PRCA        11 tests
shared/scoring-tiedown/      PRCA             9 tests
shared/scoring-teamroping/   USTRC/PRCA       18 tests
shared/scoring-steerwrestling/ PRCA           9 tests
shared/scoring-roughstock/   Shared 8-second core for the two bronc events
shared/scoring-saddlebronc/  PRCA/IPRA        6 tests
shared/scoring-bareback/     PRCA/IPRA        8 tests
shared/scoring-ranchrodeo/   WRCA             10 tests
shared/pose/                 Run-analysis engine, event-agnostic
shared/pose-events/          Feature vector + fault taxonomy, one per event
```

## Two things to know before changing any of it

**Every rule is data.** Penalty seconds, catch legality, loop counts and the
association variations all arrive in a `RulesProfile` bound to a dated rule
set. Rodeo rules change annually and mid-season — the WPRA amends
continuously — so anything hardcoded is wrong by October. The barrier value is
*required* rather than defaulted, because USTRC is 5 seconds and PRCA is 10
and quietly guessing misprices every run in a class.

**Fault codes are permanent.** The coach-side tally counts how many
contestants share a fault, which only means anything if the fault is named
identically every time. Reword a label freely; never change what a code means.
Retire it, add a new one, bump the taxonomy version.
