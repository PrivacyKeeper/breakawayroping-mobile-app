# RodeoApps — portfolio status

Last updated: 12 August 2026

This file is the portfolio's status of record. It lives in the Breakaway repo
for historical reasons; it covers all nine apps, the Rodeo OS, and the
decisions behind them.

---

## Where things stand

### Nine event apps

| App | Website | Mobile app | Notes |
|---|---|---|---|
| BarrelConnect | live | **shipped** | Has users. Team AI analysis in production. |
| BullRider | live | **shipped** | StoreKit fix owned by Haseeb. |
| Breakaway | live | scaffold | Supabase schema live, 34 tables |
| TieDown | live | scaffold | |
| TeamRope | live | scaffold | |
| Bulldogging | live | scaffold | |
| SaddleBronc | live | scaffold | |
| BarebackBronc | live | scaffold | |
| RanchRodeo | live | scaffold | |

All seven scaffolds are on branch `claude/build-apps-from-websites-4xhq0c`
in their own repos. Expo 55 + expo-router on the BarrelConnect pattern.

**71 rule-engine tests across the seven, all passing.** Run with `npm test` —
no install, no device, no database. Every engine typechecks clean under
`strict` + `noUncheckedIndexedAccess`.

Each app has: five-tab scaffold, theme, Supabase client, the event rule
engine, the run-analysis engine, and two migrations (identity/safety/rule
versioning, then the event layer).

**What a scaffold is NOT:** there is no auth, no login screen, no session,
and nothing writes to Supabase. Tabs render empty states. These are shells
with a correct spine, not usable apps.

### BarrelConnect — AI run analysis

Branch `claude/ai-run-analysis`, commit `aae1c89`. Pose-based run analysis
measured against a walk-around benchmark. Six tables with RLS, the pose
engine, services and hooks, and the coach-report engine swap.

See `AI_RUN_ANALYSIS_HANDOFF.md` on that branch. Two pieces are deliberately
not wired: no pose model is connected, and no equine pose model exists.

### Rodeo OS — `PrivacyKeeper/Rodeo-OS`

Substantially built, contrary to what this file said on 30 July.
41 tables, engine with 291 passing tests, API with 168 integration tests
against real RLS, and a secretary interface that runs a rodeo end to end.

Missing: Stripe Connect (card rows sit `pending` forever), Supabase Auth in
the UI (token pasted by hand), offline PWA, timer bridge, notices delivery
worker. Roughly the last 10%.

`docs/PRICING.md` there settles the business model: free at Grassroots
(≤100 entries/yr), $9.99 → $299/mo above that, nothing taken on the money
flow. It also records why the 2%-per-entry model was modelled and rejected.

### Supabase

Breakaway: project `zocyoakcyrwdeugkjrgh`, `ca-central-1`, 34 tables, RLS on
every one, 6 migrations applied. **The database is ahead of the repo** —
migrations 003-006 are live but not in version control. Run `supabase db
pull` before applying anything new.

---

## Decisions on record

### Palettes come from the shipped websites, not the spine

Every app's colours were read out of its live site's CSS. The spine assigns
different values. A user opening the app straight off the website should not
feel a colour change, so the site wins — the same call recorded earlier for
the Breakaway crest.

### One Supabase project for all rodeo apps (Option A)

Decided 30 July, still the plan, **still not done**. Shared: identity,
horses, arenas, associations, rule sets, organisations, events, entries,
results, payments. Each app layers its own event tables (`br_*`, `td_*`, …).

Cost is part of it but not the main argument: a roper who runs barrels and
ropes breakaway should have one account and enter the same horse once.

Migration scope: BarrelConnect (37 profiles, 178 posts, 15 horses, 104
tables), BullRider, and Breakaway (schema only, no users — the cheap one).
Cost of waiting: eight apps plus duplicate-account reconciliation.

### The apps are contestant apps; the OS is the producer console

The spine gives every app its own producer console at phase 4. The Rodeo OS
already IS that console, built and tested once. So the nine apps should
consume it — events, entries, draw, results, standings — rather than each
rebuilding it. **Not yet confirmed.** If the answer is no, every app needs
its own event-operations layer, and that decision is cheap today and a
rewrite in three months.

### Every rule is data

Penalty seconds, catch legality, loop counts, time limits and association
variations all load from a `RulesProfile` bound to a dated rule set. Rodeo
rules change annually and mid-season; the WPRA amends continuously. Anything
hardcoded is wrong by October.

The barrier value is *required* rather than defaulted: USTRC is 5 seconds,
PRCA is 10, and quietly guessing misprices every run in a class.

Every outcome carries its rule citation and edition, because contestants
argue calls and are entitled to.

### Fault codes are permanent

The coach-side tally counts how many contestants share a fault, which only
means something if the fault is named identically every time. Reword a label
freely; never change what a code means. Retire it, add a new one, bump the
taxonomy version.

### Minor-safety rules live in the database

Under-18 defaults to followers-only, enforced by trigger rather than by the
signup screen, so it holds regardless of which client writes. Block and
report are launch requirements, not phase two — App Store review rejects
social apps without them.

---

## TestFlight — what it would actually take

Apple Developer account is in hand. Beyond that:

**Blocking, in order:**

1. **Supabase consolidation.** Do it before seven apps have users, not after.
2. **Auth.** No app has a login screen. This is the real blocker — everything
   else is a feature on an app nobody can sign into.
3. **One app working end to end.** Pick Breakaway. Sign-up, profile,
   practice-run logging, one real Supabase write.
4. **Icons and splash screens.** Every app has a background colour and no
   image. TestFlight rejects a build with no icon.
5. **`npm install` and a real Metro build.** The engines are tested but no app
   has ever been bundled. Expect import/config fixes on the first build.
6. **EAS.** `eas init` per app for a project ID, then `eas build -p ios
   --profile production && eas submit`. `eas.json` already exists.

**Apple's own gates, before review:**

- Sign in with Apple, mandatory if any third-party login is offered
- In-app account deletion, required, not built
- Privacy policy URL and privacy manifest per app
- Block and report UI on user-generated content

**Corrections to the assumed list:**

- **Stripe is not needed for TestFlight.** Ship free. When payments do land:
  subscriptions go through RevenueCat/StoreKit on iOS, *never* Stripe.
  Stripe is for entry fees and marketplace only, and the spine flags the App
  Store risk — no `Linking.openURL` to a Stripe web page, native sheet only.
  Stripe Connect belongs to the Rodeo OS (producers), not these apps.
- **Weather is two pieces.** NWS API for US alerts is free and easy. Severe
  alerts are supposed to be push, not poll, which needs Firebase/APNs — not
  currently a dependency in any of the seven. Hourly forecast needs a paid
  provider. GPS itself is just `expo-location`, an afternoon.

**Recommendation:** do not put seven empty shells in TestFlight. Testers give
you one first impression. Get Breakaway genuinely working, TestFlight it
alone, then copy the working pattern outward.

---

## Open questions

- **Are the apps thin clients on the Rodeo OS?** Asked twice, not yet
  answered. Shapes every app scaffold.
- **Which OS architecture is current** — Fastify API server, or direct
  Supabase with `auth.uid()` RLS? The latter matches how everything else here
  is built and is what the OS repo actually implements.
- **The 31-defect "Architecture Fixes Summary" (F1-F31) has never been
  provided.** The OS repo's `docs/SPEC-DELTAS.md` records 40 defects found
  independently; whether these are the same list is unknown.
- **Patent scope.** The provisional (Apps 1 LLC, 31 May 2026) claims are all
  scoped to clay target shooting. Claims 1 and 4 — skeletal-geometry
  re-identification and multi-modal event detection — are the two whose
  underlying methods are sport-agnostic and now deployed in a second sport
  family. The 12-month window closes around 31 May 2027. Attorney question,
  worth raising before these ship publicly.
- BarrelConnect: which of the 20+ branches is the one to finish?
- Waitlist signups go to email only, no database. Worth a table now?

---

## Housekeeping

- `breakawayroping-mobile-app` has an orphan branch
  `claude/app-generator-toolchain` — insurance taken while the repo-attach
  service was dropping mid-build. All seven apps landed, so it has served its
  purpose. **Safe to delete**; it stayed only because the git proxy refuses
  branch deletion.
- `barrelconnect-mobile-app` still has
  `src/assets/keystore/barrel-connect.keystore` committed. That is the Android
  signing key — anyone with repo access can ship a build Play Store treats as
  authentic, and it cannot be rotated without breaking upgrades for installed
  users. Move it to EAS credentials.
- `BullRider-mobile-app` has not been reviewed. It is private and the
  repo-attach service was down on every attempt.
