#!/bin/sh
# SessionStart. Read-only, no network. Warns once per session when the
# checked-in Supabase migrations are known to be behind the live project —
# migrations 003-006 were applied through the MCP and never written back out,
# so writing new SQL against the local files produces a migration built on a
# schema that is not the real one.
#
# Stays silent in a repo with no supabase/migrations directory, and silent
# once `supabase db pull` has brought the files back in line.

# Drain stdin so the hook never blocks on an unread pipe.
cat >/dev/null 2>&1

dir="./supabase/migrations"
[ -d "$dir" ] || { printf '{}'; exit 0; }

missing=""
for n in 003 004 005 006; do
  if ! ls "$dir" 2>/dev/null | grep -q "^${n}_\|_${n}_"; then
    missing="${missing}${missing:+, }${n}"
  fi
done

# `supabase db pull` writes timestamped filenames rather than NNN_ ones, so a
# directory that already holds six or more migrations is treated as pulled.
count=$(ls -1 "$dir"/*.sql 2>/dev/null | wc -l | tr -d ' ')
if [ -z "$missing" ] || [ "$count" -ge 6 ]; then
  printf '{}'
  exit 0
fi

printf '{"hookSpecificOutput":{"hookEventName":"SessionStart","additionalContext":"Supabase schema drift: migrations %s are applied to project zocyoakcyrwdeugkjrgh but are not in %s. The database is the source of truth, not these files. Run `supabase link --project-ref zocyoakcyrwdeugkjrgh && supabase db pull` before writing any new migration, or read the live schema with the Supabase MCP first."}}' "$missing" "$dir"
