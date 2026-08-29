@STATUS.md

# BreakawayRoping.pro — mobile app

**The Expo app is not scaffolded yet.** This repo currently holds the Supabase
schema and the project's status documents. The marketing site is a separate
repo, `breakawayroping-website`.

Supabase project: **`breakawayroping.pro`**, ref `zocyoakcyrwdeugkjrgh`,
region `ca-central-1`. 34 tables, RLS on every one, six migrations applied.

## Read this before writing any SQL

**The database is ahead of this repo.** Migrations `003`–`006` are applied to
the live project but exist only there — they were applied through the Supabase
MCP and never written back out. `001` and `002` are the only files checked in.

So the live database is the source of truth, not `supabase/migrations/`. The
first thing to do here is:

```bash
supabase link --project-ref zocyoakcyrwdeugkjrgh
supabase db pull
```

Then drop any hand-written `001`/`002` duplicates `db pull` produced, and
commit. Until that runs, read the schema with the Supabase MCP rather than
inferring it from the checked-in files. A SessionStart hook in the `rodeo-apps`
plugin warns about this automatically and goes quiet once it is fixed.

## Migration conventions

- Sequential `NNN_description.sql`, following the BarrelConnect pattern.
- **Never edit an applied migration.** A correction is a new migration.
- RLS enabled on every table, policies keyed off `auth.uid()`.
- **Never** `current_setting('app.current_org_id')` or any GUC — it is not
  bound to the JWT and can be impersonated. The architecture PDF §2.1 specifies
  the GUC form and is wrong on this point; the handoff doc is correct.
- Run `get_advisors` after applying and fix what it reports. Migration `006`
  exists because of exactly that (`security_invoker` on views, revoking REST
  access on trigger functions).

## Non-negotiables

These are commitments in the published privacy policy and terms, so they are
enforced in the database with triggers, RLS, and `CHECK` constraints — never in
client code, because they must hold whichever client writes.

- Minor `latitude`/`longitude` nulled on write; `is_minor()` **fails closed**
  on a missing birth date.
- Minor profile and post visibility forced to `followers` or stricter.
- Adult→minor DMs blocked at insert without an active mentorship or a shared
  `school`/`barn`/`team` group.
- Mentorship needs both consents plus guardian approval for a minor mentee.
- Guardian links carry per-minor media, DM, and recruiting switches — honour
  all three.
- `br_practice_runs.is_official` has `CHECK (is_official = false)`. Hand-timed
  practice structurally cannot become an official result.
- `br_equipment_checks` pass/fail derives from WPRA 12.10.9 in the database,
  not from a client boolean.

Any new user-to-user contact channel needs the adult→minor guard applied at
insert. The guard on `direct_messages` does not extend itself to a table that
did not exist when it was written.

## Rules and money

Association rules are data: `rule_sets` / `rule_set_entries` /
`rule_change_log`, read through `rules_for()`. Seeded with the WPRA rolling
rulebook (amendments through 1 Oct 2025) and the 2026 PRCA Rule Book. **Never
hard-code a penalty, barrier time, or payout split into application code.**

> **PRCA Parts 9 and 10 have not been diffed** against the seeded values. Do
> that before any of this computes money.

Divisional payouts **recompute the whole class, never increment** — a late
entry, a scratch, or a corrected time re-runs every position. Store the rule
set version used so a past payout can be re-derived exactly.

## Next up

1. `supabase db pull` so the repo matches the database
2. Expo + Expo Router scaffold, §11 route tree, brand theme tokens (the crest
   palette, same eleven token names the website uses)
3. `lib/scoring/breakaway` — `BR_PENALTIES`, `officialTime`, §12 edge cases as
   tests. Diff PRCA 2026 Parts 9 and 10 first.
4. Events, entries, draws, divisional payouts
5. Producer console

## Direction that affects new schema

One shared Supabase project is the decided target for all eight rodeo apps —
shared identity, horses, arenas, associations, rule sets, organizations,
events, entries, results, payments, with per-app prefixed tables (`br_*`,
`bc_*`, `td_*`) on top. **Not built yet**; today each app has its own project
and its own `profiles`.

The tenant is the **producer organization**, not the contestant. New
event/entry/payout tables should be org-scoped from the start rather than
carrying a `producer_id` that points at a user — that is the mistake already
baked into BarrelConnect's `rodeo_events`.

Open architecture questions are listed in `STATUS.md`; they change what gets
built, so raise them rather than picking one silently.

## Claude Code setup in this repo

The `rodeo-apps` plugin is committed at `.claude/plugins/rodeo-apps/` and
enabled through `.claude/settings.json` — see
`.claude/plugins/rodeo-apps/README.md`.
