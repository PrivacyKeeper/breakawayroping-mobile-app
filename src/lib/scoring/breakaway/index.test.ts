import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { RulesProfile } from '../types.ts';
import { breakdownSegments, scoreBreakawayRun, type BreakawayRunInput } from './index.ts';

const WPRA_2026: RulesProfile = {
  ruleSetId: 'wpra-2026',
  edition: 'WPRA 2026 Rule Book',
  associationCode: 'WPRA',
  values: {
    barrier_seconds: 10,
    loops: 1,
    time_limit_seconds: 30,
    missing_flag_no_times: true,
  },
};

function run(overrides: Partial<BreakawayRunInput> = {}): BreakawayRunInput {
  return {
    rawTimeMs: 2340,
    caught: true,
    catchLegal: true,
    ropeBrokeAway: true,
    brokeAwayEarly: false,
    barrierBroken: false,
    loopsThrown: 1,
    flagAttached: true,
    rulesProfile: WPRA_2026,
    ...overrides,
  };
}

test('a clean run scores the raw time', () => {
  const outcome = scoreBreakawayRun(run());
  assert.equal(outcome.status, 'clean');
  assert.equal(outcome.officialTimeMs, 2340);
});

test('the barrier adds ten seconds, which decides the event', () => {
  const outcome = scoreBreakawayRun(run({ barrierBroken: true }));
  assert.equal(outcome.status, 'penalty');
  assert.equal(outcome.officialTimeMs, 12_340);
  assert.equal(outcome.appliedPenalties[0]?.seconds, 10);
});

test('a barrier with no seconds in the profile is refused, not guessed', () => {
  const silent: RulesProfile = { ...WPRA_2026, values: { ...WPRA_2026.values } };
  delete silent.values.barrier_seconds;

  assert.throws(
    () => scoreBreakawayRun(run({ barrierBroken: true, rulesProfile: silent })),
    /missing required numeric rule "barrier_seconds"/,
  );

  // A run with no barrier never reads the key and still scores.
  assert.equal(scoreBreakawayRun(run({ rulesProfile: silent })).status, 'clean');
});

test('a rope that never broke away is a no time, not a slow time', () => {
  const outcome = scoreBreakawayRun(run({ ropeBrokeAway: false }));
  assert.equal(outcome.status, 'no_time');
  assert.equal(outcome.appliedPenalties.at(-1)?.code, 'ROPE_NOT_BROKEN');
});

test('breaking away early is its own call, distinct from never breaking', () => {
  // Both are no times, and telling them apart is the difference between "your
  // string is set too light" and "you never got tight".
  const early = scoreBreakawayRun(run({ brokeAwayEarly: true }));
  assert.equal(early.status, 'no_time');
  assert.equal(early.appliedPenalties.at(-1)?.code, 'BREAKAWAY_EARLY');

  const never = scoreBreakawayRun(run({ ropeBrokeAway: false }));
  assert.notEqual(early.appliedPenalties.at(-1)?.code, never.appliedPenalties.at(-1)?.code);
});

test('an illegal catch is a no time even with a clean clock', () => {
  const outcome = scoreBreakawayRun(run({ catchLegal: false }));
  assert.equal(outcome.status, 'no_time');
  assert.equal(outcome.appliedPenalties.at(-1)?.code, 'ILLEGAL_CATCH');
});

test('a missing flag follows the association, and an unstated profile is refused', () => {
  assert.equal(scoreBreakawayRun(run({ flagAttached: false })).status, 'no_time');

  const lenient: RulesProfile = {
    ...WPRA_2026,
    values: { ...WPRA_2026.values, missing_flag_no_times: false },
  };
  assert.equal(scoreBreakawayRun(run({ flagAttached: false, rulesProfile: lenient })).status, 'clean');

  const silent: RulesProfile = { ...WPRA_2026, values: { ...WPRA_2026.values } };
  delete silent.values.missing_flag_no_times;
  assert.throws(
    () => scoreBreakawayRun(run({ flagAttached: false, rulesProfile: silent })),
    /missing required rule "missing_flag_no_times"/,
  );
});

test('exceeding the arena time limit is a no time', () => {
  assert.equal(scoreBreakawayRun(run({ rawTimeMs: 31_000 })).status, 'no_time');
});

test('a second loop past the limit is a no time', () => {
  assert.equal(scoreBreakawayRun(run({ loopsThrown: 2 })).status, 'no_time');
});

test('segments split the run where a roper can actually change it', () => {
  const segments = breakdownSegments(2340, 900);
  assert.equal(segments.deliveryMs, 900);
  assert.equal(segments.loopAndDrawMs, 1440);
});

test('a delivery outside the run says it does not know rather than inventing a split', () => {
  assert.deepEqual(breakdownSegments(2340, 9999), { deliveryMs: null, loopAndDrawMs: null });
  assert.deepEqual(breakdownSegments(null, 900), { deliveryMs: null, loopAndDrawMs: null });
});
