# Migrations

Supabase project: **`breakawayroping.pro`** — ref `zocyoakcyrwdeugkjrgh`, region `ca-central-1`.

All six migrations below are **already applied** to that project.

| # | Name | What it does |
| --- | --- | --- |
| 001 | `profiles_and_safety_primitives` | `profiles`, `guardian_links`, `user_settings`, roles, `is_minor()`/`is_adult()`, minor-defaults trigger, auth hook |
| 002 | `moderation_and_social_core` | blocks, mutes, reports, follows, posts, comments, likes, bookmarks, stories, notifications |
| 003 | `messaging_groups_and_mentorship` | community groups, mentorships, DMs, group chats, first-check board, **adult→minor DM guard** |
| 004 | `horses_practice_runs_and_equipment_checks` | horses with breakaway fields, arenas, calves, `br_practice_runs`, `br_equipment_checks` |
| 005 | `rule_sets_and_versioning` | `associations`, `rule_sets`, `rule_set_entries`, `rule_change_log`, `rules_for()`, seeded WPRA + PRCA 2026 |
| 006 | `harden_view_and_trigger_functions` | security-advisor fixes: `security_invoker` on the practice view, revoked REST access on trigger functions |

## Local `.sql` files are incomplete — pull them

`001` and `002` are checked in. **`003`–`006` exist only in the database.** They
were applied through the Supabase MCP during a session where writing them back
out was not practical.

Regenerate the full set from the live project — this is the first thing to do
before any further schema work:

```bash
supabase link --project-ref zocyoakcyrwdeugkjrgh
supabase db pull
```

That writes every applied migration into this directory with its real version
timestamp. Once it has run, delete the hand-written `001_*.sql` and `002_*.sql`
files if `db pull` produced duplicates of them, and commit the result.

Until that happens, **the database is the source of truth, not this folder.**

## Conventions

Follows the BarrelConnect pattern: sequentially numbered `NNN_description.sql`,
never edited after being applied. A correction is a new migration.

## Safety rules enforced in the database

These are commitments made in the published privacy policy, so they are
enforced with triggers and RLS rather than in client code:

- **Minor location precision** — `latitude`/`longitude` are nulled on write for
  any user under 18 (or with no birth date). `is_minor()` fails closed.
- **Minor profile visibility** — forced to `followers` or stricter; `public` is
  rewritten on write.
- **Minor post privacy** — same rule applies to every post.
- **Adult→minor DMs** — blocked at insert unless there is an active mentorship
  or a shared `school` / `barn` / `team` group. Raises an exception otherwise.
- **Mentorship consent** — cannot go `active` without both parties' consent,
  plus guardian approval when the mentee is a minor.
- **Practice never official** — `br_practice_runs.is_official` carries a
  `CHECK (is_official = false)`. Practice data cannot be promoted into results.

## Rules currency

`rule_sets` is seeded with the WPRA rolling rulebook (amendments through
1 Oct 2025) and the 2026 PRCA Rule Book. Per the 2026 addendum, **Parts 9 and 10
of the PRCA book have not yet been diffed** against the seeded values — do that
before any of this is used to compute money.
