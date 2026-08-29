---
name: supabase-migrations
description: Rules for changing the Rodeo Apps Supabase schema — writing or editing a migration, adding a table or column, enabling RLS, running `supabase db pull`/`db push`, or applying SQL through the Supabase MCP. Use whenever a task touches supabase/migrations/, a `.sql` file, or asks to add, alter, or drop anything in the database.
---

# Supabase migrations

Project for Breakaway: **`breakawayroping.pro`**, ref `zocyoakcyrwdeugkjrgh`, region `ca-central-1`.

## Before any schema work: the repo is behind the database

Migrations `003`–`006` are applied to the live project but exist only there —
they were applied through the Supabase MCP and never written back out. Until
that is fixed, **the database is the source of truth, not `supabase/migrations/`.**

Run this first, and do not write a new migration until it has:

```bash
supabase link --project-ref zocyoakcyrwdeugkjrgh
supabase db pull
```

Then delete the hand-written `001_*.sql` / `002_*.sql` if `db pull` produced
duplicates, and commit the result.

If you cannot run it, read the current schema with the Supabase MCP
(`list_tables`, `list_migrations`) before proposing SQL — never write a
migration against what the checked-in files imply.

## Conventions

- Sequential `NNN_description.sql`, matching the BarrelConnect pattern.
- **A migration is never edited after it is applied.** A correction is a new
  migration with a new number.
- **RLS is enabled on every table**, without exception. A table with no policy
  is a table nobody can read — that is the correct failure direction.
- Policies key off `auth.uid()`. **Never** `current_setting('app.current_org_id')`
  or any other GUC: a GUC is not bound to the JWT and can be impersonated. The
  architecture PDF specifies the GUC form; it is wrong, do not build from it.
- Derive safety- and money-relevant values in the database (triggers, generated
  columns, `CHECK`), never from client-supplied input. `br_equipment_checks`
  pass/fail is derived from WPRA 12.10.9; `br_practice_runs.is_official` carries
  `CHECK (is_official = false)`.
- After applying anything, run `get_advisors` and fix what it reports —
  `security_invoker` on views, and revoking REST access on trigger functions,
  is what migration `006` exists to do.

## Multi-tenancy, when it lands

The decided direction is **one shared Supabase project for all rodeo apps**:
shared identity, horses, arenas, associations, rule sets, organizations,
events, entries, results, payments; each app layers its own prefixed tables
(`br_*`, `bc_*`, `td_*`) on top. **This has not been built yet** — today
BarrelConnect, BullRider, and Breakaway each have their own project and their
own `profiles`.

The tenant is the **producer organization**, not the contestant. Any new
event/entry/payout table should carry an org-scoped path from the start rather
than a `producer_id` pointing at a user, which is the mistake already baked
into BarrelConnect's `rodeo_events`.

Flag it rather than guessing if a task requires the consolidated schema — that
migration is not yet planned.
