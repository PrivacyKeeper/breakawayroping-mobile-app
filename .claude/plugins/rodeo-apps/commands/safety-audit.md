---
description: Audit the schema and the diff for the under-18 protections the privacy policy commits to.
argument-hint: "[path or migration to focus on]"
allowed-tools: Bash, Read, Glob, Grep, mcp__Supabase__list_tables, mcp__Supabase__execute_sql, mcp__Supabase__get_advisors
---

Audit minor-safety enforcement. Focus on $1 if given, otherwise the working
tree diff plus the full schema.

Check each of these and report pass / fail / not-applicable with the evidence
you found:

1. `is_minor()` still fails closed on a missing birth date.
2. `latitude` / `longitude` nulled on write for minors, on every table that
   stores them — including any added since migration 001.
3. Minor profile and post visibility forced to `followers` or stricter.
4. Every user-to-user contact channel carries the adult→minor guard. Enumerate
   the tables that let one user reach another and say which ones are guarded;
   a new messaging, invite, comment, or request table is the usual gap.
5. Mentorship cannot reach `active` without both consents plus guardian
   approval for a minor mentee.
6. Guardian per-minor media / DM / recruiting switches are honoured, all three.
7. `br_practice_runs.is_official` still carries `CHECK (is_official = false)`.
8. Views are `security_invoker`; `SECURITY DEFINER` functions have REST access
   revoked.
9. RLS enabled on every table.

Report failures first, each with the table or function and the specific fix.
Do not apply fixes — this command reports. If something is enforced only in
client code, that counts as a failure.
