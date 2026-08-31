# BreakawayRoping.pro — status

Last updated: 30 July 2026

## Where things stand

### Website — `breakawayroping-website` — **done and on `main`**

Commit `ad42fe6`. 21 routes, build green, lint clean.

Landing page with 14 feature groups (121 individual features) adapted from the
BarrelConnect screen inventory, `/rules` reference, `/events`, `/support`,
7 SEO blog posts, terms / privacy / refund, `robots.ts`, `sitemap.ts`, JSON-LD
for app + site + rules FAQ. Built to the BullRider.pro pattern: Next 16 App
Router, Tailwind v4, Resend waitlist, no database, no auth.

**Blocked on you:**

- `public/logo.png` and `public/cross.jpg` are referenced but not in the repo —
  two broken image boxes until they are added. Optional:
  `public/backgrounds/arena-1.jpg` and `arena-2.jpg` turn on the arena backdrop.
- Vercel: import the repo, set `RESEND_API_KEY`, point `breakawayroping.pro`
  at it. Make `www` primary and redirect the apex — every canonical URL and the
  sitemap use `https://www.breakawayroping.pro`.
- Resend: verify `breakawayroping.pro` as a sending domain, or the waitlist
  cannot send from `support@breakawayroping.pro`.

### Supabase — **schema applied, 6 migrations**

Project `breakawayroping.pro`, ref `zocyoakcyrwdeugkjrgh`, `ca-central-1`.
34 tables, RLS enabled on every one. See `supabase/migrations/README.md`.

Covers phases 0–2 of the build map plus the rule-versioning architecture the
2026 addendum requires:

- Profiles with WPRA / NHSRA / NJHSRA / NLBRA / NIRA / PRCA membership fields
- Guardian links with per-minor media, DM, and recruiting switches
- Blocks, mutes, reports (harassment and unwanted contact called out explicitly)
- Follows, posts, comments, likes, bookmarks, stories, notifications
- Community groups — regional women's, junior, barn, team, school
- Mentorships with two-sided consent and guardian approval
- DMs and group chats
- First-check board
- Horses with `br_role`, `run_style`, `stop_rating`, `honest_in_box`, arena stats
- Calves with speed / duck / stop flags
- `br_practice_runs` — hand-timed, structurally cannot become official
- `br_equipment_checks` — pass/fail derived from WPRA 12.10.9, not client-supplied
- `rule_sets` / `rule_set_entries` / `rule_change_log` + `rules_for()`, seeded
  with WPRA and PRCA 2026

**First thing to do here:** run `supabase db pull` to get migrations 003–006
into version control. Right now the database is ahead of this repo. Details in
`supabase/migrations/README.md`.

### Mobile app — **scaffolded and building**

Expo 55 + expo-router, on the portfolio's shared spine. Both platforms produce
a release Hermes bundle.

- `lib/scoring/breakaway` — `BR_PENALTIES`, `scoreBreakawayRun`,
  `breakdownSegments`, 11 tests. The barrier is `requireNumber`, so a profile
  that does not state its penalty is refused rather than guessed at: WPRA and
  PRCA assess 10 seconds and a USTRC-style roping assesses 5, and in an event
  won by hundredths a wrong barrier is the whole result.
- Early breakaway and a rope that never broke are modelled as separate calls.
  Both are no times, and the difference is what the roper is told: "your string
  is set too light" versus "you never got tight".
- `lib/pose/event.ts` — breakaway feature vector and an 8-fault taxonomy,
  weighted to the box and the delivery because there is no second half of the
  run to make time up in.
- Auth, events, rodeo detail with map/weather/pin-drop, practice-run logging
  and profile, all against the shared Rodeo-OS database.

Still missing, and shared with the rest of the portfolio: no pose model is
connected, so `/analyze` shows the fault taxonomy rather than filming a run.
Stripe is deliberately not wired yet.

## Next up, in order

1. `supabase db pull` so the repo matches the database
2. Expo + Expo Router scaffold, §11 route tree, brand theme tokens
3. `lib/scoring/breakaway` — `BR_PENALTIES`, `officialTime`, §12 edge cases as
   tests. **Diff PRCA 2026 Parts 9 and 10 first**, per the addendum
4. Events, entries, draws, divisional payouts (recompute whole class, never
   increment)
5. Producer console

## Decisions made, for the record

- **Palette comes from the crest**, not the build map. Electric blue `#2eb3ec`,
  rope gold `#d4af37`, cream `#f2e8d5` on near-black navy `#070c15`. The map
  said "hot coral and gold on charcoal plum"; the real logo won.
- **BarrelConnect's live schema is the spine**, since
  `00_RODEOAPPS_SHARED_SPINE.md` was never provided. Its 104 tables were read
  directly from the production database and the shared core adapted here.
- **Minor-safety rules live in the database**, not the client. The privacy
  policy commits to them, so they hold regardless of which client writes.

## Portfolio direction — decided 30 July 2026

These are company-level decisions made after the Breakaway work above. They
change what gets built next.

### Two companies

- **rodeoapps.pro** — parent for the eight rodeo apps: BarrelConnect, BullRider,
  Breakaway, TeamRope, SaddleBronc, BarebackBronc, Bulldogging, TieDown,
  RanchRodeo
- **apps1llc.com** — everything non-rodeo: MarketCommand, Clay AI Coach, etc.

### Option A chosen: ONE shared Supabase project for all rodeo apps

Shared: identity, horses, arenas, associations, rule sets, organizations,
events, entries, results, payments. Each app layers its own event-specific
tables on top (`br_*`, `bc_*`, `td_*`).

**This is not yet done.** Today BarrelConnect, BullRider, and Breakaway each
have a separate Supabase project with a separate `profiles` table. A roper who
runs barrels and ropes breakaway has two accounts and enters the same horse
twice. Consolidating now costs a migration on two live apps; after eight apps
ship it costs eight plus duplicate-account reconciliation.

Migration scope: BarrelConnect (37 profiles, 178 posts, 15 horses, 104 tables),
BullRider, and Breakaway (schema only, no users — the cheap one).

### The endgame is a Procore/Toast for rodeo

The eight apps are the foundation and the distribution channel. The Rodeo OS is
the product producers run their business on. **The tenant is the producer**, not
the contestant — which means an `organizations` table, staff with roles inside
an org, and RLS scoped by tenant. Nothing has that today: BarrelConnect's
`rodeo_events.producer_id` is a user, not an org, and Breakaway has no producer
entity at all.

Consequence worth planning for: if the OS runs entries and payouts, that is
Stripe Connect with producers as connected accounts — moving other people's
money. Breakaway's published terms already say entry fees are "collected on
behalf of the producer."

### Review of the two OS documents (30 July)

`Rodeo_Apps_OS_Research.docx` and `RodeoApps_Architectur_PDF.pdf` were reviewed.
Strategy and industry research are sound. Three unresolved conflicts:

1. **RLS mechanism.** The architecture PDF §2.1 specifies
   `current_setting('app.current_org_id')`. The handoff doc explicitly forbids
   it — "no manual GUC" — and requires `auth.uid()`. The handoff is correct;
   `current_setting` is not bound to the JWT and can be impersonated. Do not
   build from the PDF's version.
2. **Backend.** PDF specifies Node.js + Fastify + Drizzle (a real API server).
   Handoff specifies no API server, direct Supabase with RLS. Different
   architectures, not phases.
3. **Schema scale.** PDF has full multi-tenancy with `org_members`, global
   users, and `org_id` on every table. Handoff has 5 tables with a single
   `orgs.owner_id` and contestants stored as plain text names. The 5-table
   version cannot grow into the other without a rewrite.

**Neither document accounts for BarrelConnect and BullRider existing.** They
describe integrating with them "if approved," as though they were third parties.
Building the OS on the 5-table schema would create a third divergent identity
model immediately after deciding to eliminate the second.

## Open questions

- **Which OS architecture is current** — Fastify API server, or direct Supabase
  with `auth.uid()` RLS? The latter matches how everything else here is built.
- **Does the OS build on the shared database, or the standalone 5-table
  schema?** Recommend the former; that means reworking the schema before Day 1.
- **The 31-defect "Architecture Fixes Summary" (F1–F31) has not been provided.**
  The PDF on hand is labelled Version 1.0 while the research doc refers to
  Architecture v2 as the version the defects were found in — so the PDF may be
  superseded. This would explain the RLS conflict.
- Website: `www` or apex as primary? Built `www`-primary; canonicals, sitemap,
  and OG tags all assume it.
- Google Search Console verification code for breakawayroping.pro.
- Which BarrelConnect branch is the one to finish? There are 20+ remote
  branches (`development`, `feature/*`, `fix/*`, `integration/*`). Not touching
  any of it until told which. `update-barrelconnect-mobile-app` currently holds
  the update plan document only — no code changes.
- Waitlist signups currently go to email only, no database. Worth a table now
  that Supabase exists?

## Unrelated, but worth fixing

`barrelconnect-mobile-app` has `src/assets/keystore/barrel-connect.keystore`
committed. That is the Android signing key — anyone with repo access can ship a
build Play Store treats as authentic, and it cannot be rotated without breaking
upgrades for installed users. Move it to EAS credentials. The `.env` next to it
is low-risk by comparison since those are all `EXPO_PUBLIC_*` values that ship
in the bundle anyway.
