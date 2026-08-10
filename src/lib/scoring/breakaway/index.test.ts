// src/lib/scoring/breakaway/index.test.ts
//
// Run with: npm test   (node --test, no device or database needed)

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { RulesProfile } from '../types.ts';
import { assignDivisions, scoreBreakawayRun, type BreakawayRunInput } from './index.ts';

const WPRA_2026: RulesProfile = {
  ruleSetId: 'wpra-2026',
  edition: 'WPRA 2026',
  associationCode: 'WPRA',
  values: {
    barrier_seconds: 10,
    loops: 1,
    equipment_check_required: true,
    equipment_min_knots: 3,
    equipment_min_flag_inches: 12,
  },
};

function run(overrides: Partial<BreakawayRunInput> = {}): BreakawayRunInput {
  return {
    rawTimeMs: 2400,
    catchType: 'bell_collar',
    barrierBroken: false,
    stringBroke: true,
    ropeReleased: true,
    loopsThrown: 1,
    extremityBeforeFlag: false,
    rulesProfile: WPRA_2026,
    ...overrides,
  };
}

test('a clean bell collar catch scores the raw time', () => {
  const outcome = scoreBreakawayRun(run());
  assert.equal(outcome.status, 'clean');
  assert.equal(outcome.officialTimeMs, 2400);
  assert.equal(outcome.appliedPenalties.length, 0);
});

test('a broken barrier adds the profile penalty, not a hardcoded ten', () => {
  const outcome = scoreBreakawayRun(run({ barrierBroken: true }));
  assert.equal(outcome.status, 'penalty');
  assert.equal(outcome.officialTimeMs, 12400);
  assert.equal(outcome.appliedPenalties[0]?.code, 'BARRIER');
  assert.equal(outcome.appliedPenalties[0]?.seconds, 10);

  const fiveSecond: RulesProfile = {
    ...WPRA_2026,
    values: { ...WPRA_2026.values, barrier_seconds: 5 },
  };
  const other = scoreBreakawayRun(run({ barrierBroken: true, rulesProfile: fiveSecond }));
  assert.equal(other.officialTimeMs, 7400);
});

test('scoring refuses rather than guessing when the barrier value is missing', () => {
  const incomplete: RulesProfile = { ...WPRA_2026, values: { loops: 1 } };
  assert.throws(
    () => scoreBreakawayRun(run({ barrierBroken: true, rulesProfile: incomplete })),
    /missing required numeric rule "barrier_seconds"/,
  );
});

test('every catch other than the bell collar is a no time', () => {
  for (const catchType of ['half_head', 'horn', 'figure_eight', 'no_catch'] as const) {
    const outcome = scoreBreakawayRun(run({ catchType }));
    assert.equal(outcome.status, 'no_time', `${catchType} should be a no time`);
  }
});

test('a leg in the loop BEFORE the flag is a no time', () => {
  const outcome = scoreBreakawayRun(
    run({ catchType: 'leg_in_loop', extremityBeforeFlag: true }),
  );
  assert.equal(outcome.status, 'no_time');
  assert.equal(outcome.appliedPenalties.at(-1)?.code, 'LEG_IN_LOOP');
});

test('a leg in the loop AFTER the flag stands — the run counts', () => {
  // National Finals ground rules. The catch is judged at the moment of the
  // flag, not afterwards. This is the mirror image of team roping and it is
  // the edge case most likely to be implemented backwards.
  const outcome = scoreBreakawayRun(
    run({ catchType: 'leg_in_loop', extremityBeforeFlag: false }),
  );
  assert.equal(outcome.status, 'clean');
  assert.equal(outcome.officialTimeMs, 2400);
});

test('the string not breaking is a no time even with a catch', () => {
  const outcome = scoreBreakawayRun(run({ stringBroke: false }));
  assert.equal(outcome.status, 'no_time');
  assert.equal(outcome.appliedPenalties.at(-1)?.code, 'STRING_NOT_BROKEN');
});

test('a bad string is a disqualification, a bad flag is only a minor', () => {
  const badString = scoreBreakawayRun(
    run({
      equipment: { stringGaugeOk: true, knotCount: 2, flagPresent: true, flagSizeInches: 12 },
    }),
  );
  assert.equal(badString.status, 'dq');

  const badFlag = scoreBreakawayRun(
    run({
      equipment: { stringGaugeOk: true, knotCount: 3, flagPresent: true, flagSizeInches: 8 },
    }),
  );
  assert.equal(badFlag.status, 'clean');
  assert.equal(badFlag.officialTimeMs, 2400);
  assert.ok(badFlag.appliedPenalties.some((x) => x.code === 'EQUIPMENT_FLAG'));
});

test('exceeding the class loop limit is a no time', () => {
  assert.equal(scoreBreakawayRun(run({ loopsThrown: 2 })).status, 'no_time');

  const twoLoop: RulesProfile = { ...WPRA_2026, values: { ...WPRA_2026.values, loops: 2 } };
  const jackpot = scoreBreakawayRun(run({ loopsThrown: 2, rulesProfile: twoLoop }));
  assert.equal(jackpot.status, 'clean');
});

test('every outcome cites the rule and the edition', () => {
  const outcome = scoreBreakawayRun(run({ barrierBroken: true }));
  assert.match(outcome.explanation, /WPRA 2026/);
  assert.ok(outcome.appliedPenalties.every((x) => x.rule.includes('WPRA 2026')));
});

test('divisions are relative to the fast time, so the whole class recomputes', () => {
  const before = assignDivisions(
    [
      { entryId: 'a', officialTimeMs: 2400 },
      { entryId: 'b', officialTimeMs: 2900 },
      { entryId: 'c', officialTimeMs: 3600 },
    ],
    [0.5, 1.0],
  );
  assert.equal(before.find((x) => x.entryId === 'a')?.division, 1);
  assert.equal(before.find((x) => x.entryId === 'b')?.division, 2);
  assert.equal(before.find((x) => x.entryId === 'c')?.division, 3);

  // A faster time lands and everybody shifts. Recompute, never increment.
  const after = assignDivisions(
    [
      { entryId: 'a', officialTimeMs: 2400 },
      { entryId: 'b', officialTimeMs: 2900 },
      { entryId: 'c', officialTimeMs: 3600 },
      { entryId: 'd', officialTimeMs: 2000 },
    ],
    [0.5, 1.0],
  );
  assert.equal(after.find((x) => x.entryId === 'd')?.division, 1);
  assert.equal(after.find((x) => x.entryId === 'a')?.division, 1);
  assert.equal(after.find((x) => x.entryId === 'b')?.division, 2);
  assert.equal(after.find((x) => x.entryId === 'c')?.division, 3);
});
