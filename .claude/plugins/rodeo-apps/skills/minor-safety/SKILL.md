---
name: minor-safety
description: The under-18 protections the Rodeo Apps privacy policy commits to, and where they are enforced. Use whenever work touches profiles, birth dates, guardians, location or latitude/longitude, profile or post visibility, direct messages, group chat, mentorships, follows, reports, blocks, or any feed or search that could expose a minor — in SQL, in the app, or in policy copy.
---

# Minor safety

These are commitments in the published privacy policy, so they are enforced
**with triggers and RLS in the database**, not in client code. They must hold
no matter which client writes — mobile, website, a script, or the SQL editor.

## The rules as built (migrations 001–003)

| Rule | Enforcement |
| --- | --- |
| Minor location precision | `latitude` / `longitude` nulled on write for any user under 18 **or with no birth date** |
| Minor profile visibility | forced to `followers` or stricter; `public` rewritten on write |
| Minor post privacy | same rule applied to every post |
| Adult → minor DMs | blocked at insert unless an active mentorship or a shared `school` / `barn` / `team` group exists; raises otherwise |
| Mentorship consent | cannot reach `active` without both parties' consent, plus guardian approval when the mentee is a minor |
| Practice never official | `br_practice_runs.is_official` has `CHECK (is_official = false)` |

`is_minor()` **fails closed** — unknown or missing birth date is treated as a
minor. Keep it that way. Guardian links carry per-minor media, DM, and
recruiting switches; honour all three, not just the DM one.

## When reviewing or writing code

Ask these in order, and answer them from the SQL, not from the client:

1. Does this add a new way to read a minor's location, real name, school,
   barn, or precise whereabouts? If yes, it needs the same nulling/visibility
   treatment the existing tables get.
2. Does it add a new contact channel between users? Any new messaging, comment,
   request, or invite path needs the adult→minor guard applied at insert — the
   guard on `direct_messages` does not cover a table that did not exist when it
   was written.
3. Does it expose data through a **view or a `SECURITY DEFINER` function**?
   Views need `security_invoker`; definer functions bypass RLS entirely and
   need REST access revoked. This is what migration `006` fixed once already.
4. Does a new join or feed query let a blocked or muted user back in?
5. If the answer is "the app filters that out" — that is not enforcement. Move
   it into the database.

## Never

- Never relax a guard to make a feature work. Raise the conflict instead.
- Never let `is_minor()` default to adult on missing data.
- Never store minor location at full precision "and round it on read".
- Never promote practice data into official results, in any table or code path.
