import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { RulesProfile } from '../types.ts';
import { creditHazer, scoreSteerWrestlingRun, type SteerWrestlingRunInput } from './index.ts';

const PRCA: RulesProfile = {
  ruleSetId: 'prca-2026',
  edition: 'PRCA 2026 Rule Book',
  associationCode: 'PRCA',
  values: { barrier_seconds: 10, time_limit_seconds: 30, hazer_interference_no_times: true },
};

function run(overrides: Partial<SteerWrestlingRunInput> = {}): SteerWrestlingRunInput {
  return {
    rawTimeMs: 4100,
    caught: true,
    legalFall: true,
    steerDownEarly: false,
    barrierBroken: false,
    hazerId: 'h1',
    rulesProfile: PRCA,
    ...overrides,
  };
}

test('a legal fall scores the raw time', () => {
  const outcome = scoreSteerWrestlingRun(run());
  assert.equal(outcome.status, 'clean');
  assert.equal(outcome.officialTimeMs, 4100);
});

test('you cannot compete without a hazer', () => {
  const outcome = scoreSteerWrestlingRun(run({ hazerId: null }));
  assert.equal(outcome.status, 'no_time');
  assert.equal(outcome.appliedPenalties[0]?.code, 'NO_HAZER');
});

test('a steer thrown with its head turned back is not down legally', () => {
  const outcome = scoreSteerWrestlingRun(run({ legalFall: false }));
  assert.equal(outcome.status, 'no_time');
  assert.equal(outcome.appliedPenalties.at(-1)?.code, 'ILLEGAL_FALL');
});

test('a steer that goes down before it is under control must be let up', () => {
  assert.equal(scoreSteerWrestlingRun(run({ steerDownEarly: true })).status, 'no_time');
});

test('the barrier is the only additive penalty', () => {
  const outcome = scoreSteerWrestlingRun(run({ barrierBroken: true }));
  assert.equal(outcome.officialTimeMs, 14_100);
  assert.equal(outcome.appliedPenalties.filter((x) => x.seconds).length, 1);
});

test('hazer interference is association dependent', () => {
  assert.equal(scoreSteerWrestlingRun(run({ hazerInterference: true })).status, 'no_time');

  const lenient: RulesProfile = {
    ...PRCA,
    values: { ...PRCA.values, hazer_interference_no_times: false },
  };
  assert.equal(
    scoreSteerWrestlingRun(run({ hazerInterference: true, rulesProfile: lenient })).status,
    'clean',
  );
});

test('neck twisting after the fall is a disqualification', () => {
  assert.equal(scoreSteerWrestlingRun(run({ roughHandling: true })).status, 'dq');
});

test('the hazer split always adds back to exactly what was won', () => {
  // An odd amount at 25% is where naive rounding loses a cent, and a ledger
  // that does not balance is a ledger nobody trusts.
  const credit = creditHazer(100_001, 'h1', 25);
  assert.equal(credit.amountCents + credit.wrestlerAmountCents, 100_001);
  assert.equal(credit.amountCents, 25_000);
  assert.equal(credit.wrestlerAmountCents, 75_001);
});

test('a nonsense hazer share is refused', () => {
  assert.throws(() => creditHazer(10_000, 'h1', 120), /between 0 and 100/);
});
