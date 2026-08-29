---
description: Compare the checked-in Supabase migrations against the live project and report the drift.
allowed-tools: Bash, Read, Glob, mcp__Supabase__list_migrations, mcp__Supabase__list_tables, mcp__Supabase__get_advisors
---

Report the current state of the Breakaway database against the repo. Do not
change anything.

1. List the migration files in `supabase/migrations/` with their numbers.
2. Read `supabase/migrations/README.md` for what is known to be applied.
3. Query the live project (ref `zocyoakcyrwdeugkjrgh`) with `list_migrations`
   and `list_tables`.
4. Run `get_advisors` for security and performance findings.

Then report, briefly:

- Which applied migrations have **no local `.sql` file** — the repo's known gap
  is `003`–`006`.
- Any local file that is **not** applied upstream.
- Whether every table has RLS enabled, and name any that do not.
- Open advisor findings, most serious first.
- The exact next command to run, which is normally
  `supabase link --project-ref zocyoakcyrwdeugkjrgh && supabase db pull`.

If the Supabase MCP is unavailable, say so plainly and report only what the
files show — do not infer the live schema from the checked-in migrations.
