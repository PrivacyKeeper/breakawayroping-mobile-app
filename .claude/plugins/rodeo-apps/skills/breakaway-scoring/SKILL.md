---
name: breakaway-scoring
description: How breakaway run times, penalties, divisional payouts, and association rule versions must be computed. Use when work involves scoring, official time, penalties, no-time, barrier, draws, entries, 1D/2D/3D divisions, jackpot or payout money, equipment checks, or the WPRA / PRCA / NHSRA / NJHSRA / NLBRA / NIRA rule sets.
---

# Breakaway scoring and rule versioning

## Rules are data, not constants

Association rules live in `rule_sets` / `rule_set_entries` with a
`rule_change_log`, read through `rules_for()`. Seeded with the WPRA rolling
rulebook (amendments through 1 Oct 2025) and the 2026 PRCA Rule Book.

**Never hard-code a penalty value, barrier time, or payout split into
application code.** Read it from the rule set that applies to the event's
association and date. A 2027 amendment must be a row, not a deploy.

> Per the 2026 addendum, **PRCA Parts 9 and 10 have not been diffed** against
> the seeded values. Do that diff before any of this computes money, and say so
> if asked to ship payout logic before it has happened.

## Scoring

`lib/scoring/breakaway` is the intended home for `BR_PENALTIES` and
`officialTime`. Requirements:

- Every §12 edge case gets a test. Scoring is the part that gets argued about
  at the arena; the tests are the argument.
- Official time is derived, never client-supplied. A client sends inputs
  (barrier, catch, flag, penalties observed); the official number is computed
  server-side against the applicable rule set.
- Hand-timed practice is structurally separate: `br_practice_runs` cannot be
  promoted into results, and nothing should offer to.
- Equipment pass/fail derives from WPRA 12.10.9 in the database
  (`br_equipment_checks`), not from a client boolean.

## Divisional payouts

- **Recompute the whole class, never increment.** A late entry, a scratch, a
  corrected time, or a rule-set change re-runs the payout for every position in
  that division. Incremental adjustment is how money goes wrong quietly.
- Payout math is deterministic and reproducible from stored inputs: the entry
  list, the times, the rule set version, and the split table. Store the rule set
  version used so a past payout can be re-derived exactly.
- Ties, no-times, and disqualifications follow the association's rules for that
  event's date — not a general default.

## Money moves through a producer

The published terms say entry fees are "collected on behalf of the producer."
If entries and payouts run through the platform, that is Stripe Connect with
producers as connected accounts. Treat any payout code as handling other
people's money: no silent rounding, no unlogged adjustment, no path that writes
a result without recording who and which rule version.
