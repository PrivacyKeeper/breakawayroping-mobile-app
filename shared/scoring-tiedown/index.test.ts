import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { RulesProfile } from '../types.ts';
import { breakdownSegments, scoreTieDownRun, type TieDownRunInput } from './index.ts';

const PRCA_2026: RulesProfile = {
  ruleSetId: 'prca-2026',
  edition: 'PRCA 2026 Rule Book',
  associationCode: 'PRCA',
  values: {
    barrier_seconds: 10,
    loops: 1,
    time_limit_seconds: 30,
    jerk_down_disqualifies: true,
  },
};

function run(overrides: Partial<TieDownRunInput> = {}): TieDownRunInput {
  return {
    rawTimeMs: 8400,
    caught: true,
    calfThrownByHand: true,
    legsTied: 3,
    wrapAndHooey: true,
    tieHeld: true,
    ropeStayedSlack: true,
    barrierBroken: false,
    loopsThrown: 1,
    jerkDown: false,
    rulesProfile: PRCA_2026,
    ...overrides,
  };
}

test('a clean run scores the raw time', () => {
  const outcome = scoreTieDownRun(run());
  assert.equal(outcome.status, 'clean');
  assert.equal(outcome.officialTimeMs, 8400);
});

test('the barrier is the only additive penalty in the event', () => {
  const outcome = scoreTieDownRun(run({ barrierBroken: true }));
  assert.equal(outcome.officialTimeMs, 18400);
  assert.equal(outcome.appliedPenalties.filter((x) => x.seconds).length, 1);
});

test('the tie failing inside six seconds is a no time', () => {
  const outcome = scoreTieDownRun(run({ tieHeld: false }));
  assert.equal(outcome.status, 'no_time');
  assert.equal(outcome.appliedPenalties.at(-1)?.code, 'TIE_FAILED_6S');
});

test('a tie without a wrap and a hooey is illegal', () => {
  assert.equal(scoreTieDownRun(run({ wrapAndHooey: false })).status, 'no_time');
  assert.equal(scoreTieDownRun(run({ legsTied: 2 })).status, 'no_time');
});

test('jerk-down disqualifies only where the association enforces it', () => {
  assert.equal(scoreTieDownRun(run({ jerkDown: true })).status, 'no_time');

  const lenient: RulesProfile = {
    ...PRCA_2026,
    values: { ...PRCA_2026.values, jerk_down_disqualifies: false },
  };
  const outcome = scoreTieDownRun(run({ jerkDown: true, rulesProfile: lenient }));
  assert.equal(outcome.status, 'clean');
});

test('unintentional dragging is a fine, intentional is a disqualification', () => {
  const unintentional = scoreTieDownRun(run({ dragging: 'unintentional' }));
  assert.equal(unintentional.status, 'clean');
  assert.ok(unintentional.appliedPenalties.some((x) => x.code === 'DRAGGING_UNINT'));

  assert.equal(scoreTieDownRun(run({ dragging: 'intentional' })).status, 'dq');
});

test('exceeding the arena time limit is a no time', () => {
  assert.equal(scoreTieDownRun(run({ rawTimeMs: 31_000 })).status, 'no_time');
});

test('a calf already down must be let up and thrown by hand', () => {
  assert.equal(scoreTieDownRun(run({ calfThrownByHand: false })).status, 'no_time');
});

test('segments split the run into what the roper actually wants to see', () => {
  const breakdown = breakdownSegments({
    barrierBreakMs: -120,
    leaveBoxMs: 0,
    catchMs: 2300,
    slackPulledMs: 2500,
    dismountMs: 3400,
    downTheRopeMs: 4200,
    flankMs: 5000,
    stringOnMs: 5200,
    tieCompleteMs: 8400,
    remountMs: 9600,
    horseStepMs: 9800,
    judgeApproveMs: 15_800,
  });

  assert.equal(breakdown.timeToCatchMs, 2300);
  assert.equal(breakdown.dismountMs, 1100);
  assert.equal(breakdown.tieMs, 3200);
  assert.ok(breakdown.horseShare > 0 && breakdown.horseShare < 1);
});
