#!/usr/bin/env bash
# Commit each generated app on its designated branch, ready to push.
set -euo pipefail

BRANCH=claude/build-apps-from-websites-4xhq0c
BUILD=/workspace/build
FOOTER=$'\nCo-Authored-By: Claude Opus 5 <noreply@anthropic.com>\nClaude-Session: https://claude.ai/code/session_01NXYnKrw9YVqaoGogpffV8L'

commit_app() {
  local repo="$1"; shift
  local msg="$1"; shift
  local dir="$BUILD/$repo"

  cd "$dir"
  git init -q 2>/dev/null || true
  git remote remove origin 2>/dev/null || true
  git remote add origin "https://github.com/PrivacyKeeper/$repo"
  git checkout -q -B "$BRANCH"
  git add -A
  if git diff --cached --quiet; then
    echo "$repo: nothing to commit"
    return
  fi
  printf '%s%s\n' "$msg" "$FOOTER" |
    git -c user.email=mf90277@gmail.com -c user.name="Claude" commit -q -F -
  echo "$repo: committed $(git rev-parse --short HEAD)"
}

commit_app teamrope-mobile-app "Scaffold the Team Roping mobile app

Expo + expo-router on the BarrelConnect pattern, with the USTRC/PRCA rule
engine and the run-analysis engine.

This is not primarily a results app. Over 200,000 ropers carry a handicap
number and it is the organising principle of the whole sport, so
classification and division eligibility are first-class here rather than a
JSON blob on a profile. Partners gets a tab; Horses does not.

Eighteen tests, the most of any app in the set, because this is where the
rules genuinely disagree with each other:

- The barrier is 5 seconds under USTRC and 10 under PRCA. The map calls this
  the single most common misconfiguration in existing rodeo software, so the
  value is required rather than defaulted and both are covered by tests.
- Crossfire is judged on loop RELEASE under USTRC and on loop CONTACT under
  PRCA, which the 2026 addendum corrects. A heeler may release before the
  turn completes as long as contact happens after. The engine takes both
  frames and the class profile decides, so a run legal under one standard
  and illegal under the other resolves correctly either way.
- A front foot in the heel loop counts if it comes free before the team
  calls for time. The flagger will not allow extra time for it.
- Facing is required in a face class and not in a flag-on-the-heels class.

Classification carries its own tests: numbers are numeric(3,1) because half
numbers have been the norm since the WSTR moved to an 18-point scale in
2010; two Elite ropers must go up a division; and the higher divisions need
a minimum on at least one end. Eligibility reports every reason at once
rather than one at a time, because a roper should not discover them
sequentially at the entry desk.

Tie-on eligibility is validated against birth date, gender and current
classification before an entry is accepted. The female rule is day-based —
eligibility starts on the 13th birthday itself, not the calendar year — and
that boundary is tested on both sides.

Palette read from the shipped teamrope.pro stylesheet: copper on deep saddle
brown.

Run analysis reports crossfire margin under both standards, and quantifies
handle quality, because most heelers miss because of the header's handle
rather than their own throw. Not wired yet: no pose model. See
AI_ANALYSIS.md."

commit_app bulldogging-mobile-app "Scaffold the Bulldogging mobile app

Expo + expo-router on the BarrelConnect pattern, with the PRCA rule engine
and the run-analysis engine.

After breakaway this is the simplest engine in the portfolio — one additive
barrier penalty and a binary legal-fall judgment. What makes the event
different is not the scoring: you physically cannot compete without a hazer,
and the hazer is owed a share of what you win. So Hazers gets a tab, and
creditHazer() splits a placing in integer cents with the remainder going to
the wrestler, so the two lines always add back to exactly what was won. A
ledger that does not balance is a ledger nobody trusts, and this whole
feature exists to make the after-the-rodeo argument go away.

Nine tests, including: a steer thrown with its head turned back is not down
legally, a steer that goes down before it is under control must be let up,
hazer interference is association-dependent and gated on the profile, and
the cent split holds on an odd amount at 25 percent.

Both parties can read the assignment and the settlement ledger. That is the
point of it, so the RLS says so explicitly.

Palette read from the shipped bulldogging.pro stylesheet: steel blue and
gold on slate.

Run analysis measures dismount timing against closing rate — going too early
is the number one fault in the event and it is invisible from the ground —
and produces a hazer line-deviation overlay, which is the first objective
measurement of hazing quality anyone has produced. Not wired yet: no pose
model. See AI_ANALYSIS.md."

commit_app saddlebronc-mobile-app "Scaffold the Saddle Bronc mobile app

Expo + expo-router on the BarrelConnect pattern, with the PRCA/IPRA rule
engine and the run-analysis engine.

The first app in the portfolio where the score is not a time, which changes
the data model, and where half the score belongs to an animal the contestant
does not own. So Draw replaces Horses as a tab: the horse you drew is the
screen you open first, and bronc_patterns carries what every recorded trip
on that animal showed.

The scoring core lives in src/lib/scoring/roughstock.ts and is shared with
bareback deliberately — the bareback map is explicit that the two share an
engine and that forking one into the other is the wrong move. Each event
supplies its own disqualification codes and equipment rules on top.

Six tests. The one that matters most is the mark-out variation: PRCA treats
a missed mark-out as an automatic disqualification, while the IPRA changed
in 2024 to fold foot position at the moment the front feet touch down into
the judges' 25 points instead. Same physical event, opposite outcome,
decided by the profile. Also covered: a partial judge card is refused rather
than scored, and a mark above 25 on any component is rejected.

All four component marks are stored, never just the total — judge splits are
analytically interesting and are needed to reconstruct a protest.

Palette read from the shipped saddlebronc.pro stylesheet: antique gold on
midnight.

Run analysis freezes the mark-out frame, which is the single highest-value
frame in the sport because it decides whether the ride counts at all, and
measures spurring rhythm as phase offset against the horse's rise. Riders
lose points to being half a beat late and cannot feel it. Not wired yet: no
pose model. See AI_ANALYSIS.md."

commit_app barebackbronc-mobile-app "Scaffold the Bareback Riding mobile app

Expo + expo-router on the BarrelConnect pattern, with the PRCA/IPRA rule
engine and the run-analysis engine.

Shares src/lib/scoring/roughstock.ts with saddle bronc rather than forking
it, which the build map asks for by name. What is different here is the
rigging and the health record.

The rigging specification is precise and enforceable at the chute, so
checkRiggingSpec() is meant to run at the equipment check rather than at
scoring time — a rider should find out in the alley, not after an
eighty-point ride gets thrown out. It reports every failure at once. The
same limits are a generated column on bb_riggings so the database agrees
with the client.

Eight tests, including a rigging at the limits passing, the multi-failure
report, and the PRCA/IPRA mark-out split.

Health is weighted heaviest in this app of the whole portfolio, and
bb_health_records is readable by the athlete alone — no coach read, no team
read. The app records and never clears anybody to ride; the analysis
surfaces elbow load and neck position as information about how a career is
accumulating wear, stated as such every time.

Palette read from the shipped barebackbronc.pro stylesheet: crimson on near
black.

Run analysis counts lick completeness, which is the number judges are
actually rewarding and no rider can count himself, and knee-lift fade across
the last three jumps, which every rider has and none can feel. Not wired
yet: no pose model. See AI_ANALYSIS.md."

commit_app ranchrodeo-mobile-app "Scaffold the Ranch Rodeo mobile app

Expo + expo-router on the BarrelConnect pattern, with the WRCA rule engine
and the run-analysis engine.

The only team-scored app in the set, and the only one where the thing being
ranked is neither a time nor a score but points across a card of compulsory
events. Standings gets a tab because the standings are the product.

The points scale is data, not code. Two published scales ship as presets and
are seeded in the migration: the WRCA sanctioned pattern that descends from
the team count, and the Texas Ranch Round-Up's fixed 10/7/5/3/1 table. Plus
a custom table builder, because ranch rodeo producers each have their own
arithmetic and will not change it for an app. Tiebreaker order is also
producer-configurable and published before the rodeo, so it is an input
rather than a constant.

Ten tests: penalties stack and can push a run past the two minute limit,
cutting out of sequence is a no time rather than a penalty, no time equals
no points under either scale, the all-events bonus only lands for a team
that actually competed in all of them, ties break on the published order,
and a genuinely tied pair shares a rank.

The alternate rule is enforced in the engine as well as the roster editor:
once an original participant is replaced, that participant cannot return to
the competition.

Palette read from the shipped ranchrodeo.pro stylesheet: brand-iron red on
weathered oak.

Run analysis targets team efficiency rather than individual technique, which
is a genuine difference from the rest of the portfolio — dead time where
four people waited on each other is usually the cheapest time on the card to
get back. Penalty-shaped observations (loping in the herd, a second rider in
the herd) are surfaced as things to check against the flag, never as an
official call; the judge on the ground is the authority and the app says so.
Not wired yet: no pose model. See AI_ANALYSIS.md."
