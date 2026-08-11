// Shared roughstock core, exercised through both event wrappers so the
// saddle bronc and bareback paths are both covered by the same cases.

import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { JudgeScore, RulesProfile } from './types.ts';
import { scoreSaddleBroncRide } from './saddlebronc/index.ts';
import { checkRiggingSpec, scoreBarebackRide, type RiggingSpec } from './bareback/index.ts';

const PRCA: RulesProfile = {
  ruleSetId: 'prca-2026',
  edition: 'PRCA 2026 Rule Book',
  associationCode: 'PRCA',
  values: { mark_out_treatment: 'disqualify', judge_count: 2, judge_component_max: 25 },
};

const IPRA: RulesProfile = {
  ruleSetId: 'ipra-2026',
  edition: 'IPRA 2026',
  associationCode: 'IPRA',
  // Changed in 2024: foot position at the moment the front feet touch down is
  // folded into the judges' marks instead of producing an automatic no score.
  values: { mark_out_treatment: 'scored', judge_count: 2, judge_component_max: 25 },
};

const CARD: JudgeScore[] = [
  { judgeId: 'j1', rider: 22, animal: 21 },
  { judgeId: 'j2', rider: 21, animal: 22 },
];

test('a qualified ride sums four component marks to a score out of 100', () => {
  const outcome = scoreSaddleBroncRide({
    qualifiedRide: true,
    markedOut: true,
    judgeScores: CARD,
    freeHandTouched: false,
    lostStirrup: false,
    lostRein: false,
    rulesProfile: PRCA,
  });
  assert.equal(outcome.status, 'clean');
  assert.equal(outcome.officialScore, 86);
});

test('a missed mark-out disqualifies under PRCA and is scored under IPRA', () => {
  const base = {
    qualifiedRide: true,
    markedOut: false,
    judgeScores: CARD,
    freeHandTouched: false,
    lostStirrup: false,
    lostRein: false,
  };

  const prca = scoreSaddleBroncRide({ ...base, rulesProfile: PRCA });
  assert.equal(prca.status, 'no_score');
  assert.equal(prca.appliedPenalties[0]?.code, 'MISSED_OUT');

  const ipra = scoreSaddleBroncRide({ ...base, rulesProfile: IPRA });
  assert.equal(ipra.status, 'clean');
  assert.equal(ipra.officialScore, 86);
  assert.match(ipra.explanation, /folded into the judges/);
});

test('bucking off before the whistle is a no score', () => {
  const outcome = scoreSaddleBroncRide({
    qualifiedRide: false,
    markedOut: true,
    judgeScores: CARD,
    freeHandTouched: false,
    lostStirrup: false,
    lostRein: false,
    rulesProfile: PRCA,
  });
  assert.equal(outcome.status, 'no_score');
  assert.equal(outcome.appliedPenalties[0]?.code, 'BUCKED_OFF');
});

test('saddle bronc disqualifications: free hand, stirrup, rein', () => {
  const base = {
    qualifiedRide: true,
    markedOut: true,
    judgeScores: CARD,
    freeHandTouched: false,
    lostStirrup: false,
    lostRein: false,
    rulesProfile: PRCA,
  };
  assert.equal(scoreSaddleBroncRide({ ...base, freeHandTouched: true }).status, 'no_score');
  assert.equal(scoreSaddleBroncRide({ ...base, lostStirrup: true }).status, 'no_score');
  assert.equal(scoreSaddleBroncRide({ ...base, lostRein: true }).status, 'no_score');
});

test('a reride offer leaves the score pending until the rider decides', () => {
  const outcome = scoreSaddleBroncRide({
    qualifiedRide: true,
    markedOut: true,
    judgeScores: CARD,
    freeHandTouched: false,
    lostStirrup: false,
    lostRein: false,
    reride: { offered: true, accepted: null },
    rulesProfile: PRCA,
  });
  assert.equal(outcome.status, 'reride_pending');
  assert.equal(outcome.officialScore, 86);
});

test('a partial judge card is refused rather than scored', () => {
  assert.throws(
    () =>
      scoreSaddleBroncRide({
        qualifiedRide: true,
        markedOut: true,
        judgeScores: [CARD[0] as JudgeScore],
        freeHandTouched: false,
        lostStirrup: false,
        lostRein: false,
        rulesProfile: PRCA,
      }),
    /Refusing to score a partial card/,
  );
});

test('a mark above 25 on any component is rejected', () => {
  assert.throws(
    () =>
      scoreSaddleBroncRide({
        qualifiedRide: true,
        markedOut: true,
        judgeScores: [
          { judgeId: 'j1', rider: 26, animal: 20 },
          { judgeId: 'j2', rider: 20, animal: 20 },
        ],
        freeHandTouched: false,
        lostStirrup: false,
        lostRein: false,
        rulesProfile: PRCA,
      }),
    /outside 0-25/,
  );
});

// --- Bareback specifics ----------------------------------------------------

function rigging(overrides: Partial<RiggingSpec> = {}): RiggingSpec {
  return {
    handholdLengthInches: 8,
    suedeCoverInches: 3,
    widthAtHandholdInches: 10,
    widthAtDRingInches: 6,
    handholdMaterialLegal: true,
    cinchMaterial: 'mohair',
    hardwareIsDRingsOnly: true,
    ...overrides,
  };
}

test('a rigging at the limits passes', () => {
  assert.equal(checkRiggingSpec(rigging()).passes, true);
});

test('the rigging check reports every failure at once, not the first', () => {
  const check = checkRiggingSpec(
    rigging({
      handholdLengthInches: 9,
      suedeCoverInches: 2,
      cinchMaterial: 'other',
    }),
  );
  assert.equal(check.passes, false);
  assert.equal(check.failures.length, 3);
});

test('a failed rigging inspection is a no score', () => {
  const outcome = scoreBarebackRide({
    qualifiedRide: true,
    markedOut: true,
    judgeScores: CARD,
    freeArmTouched: false,
    handOut: false,
    rigging: rigging({ handholdLengthInches: 9 }),
    rulesProfile: PRCA,
  });
  assert.equal(outcome.status, 'no_score');
  assert.equal(outcome.appliedPenalties[0]?.code, 'EQUIPMENT_VIOLATION');
});

test('bareback disqualifications: free arm and losing the rigging', () => {
  const base = {
    qualifiedRide: true,
    markedOut: true,
    judgeScores: CARD,
    freeArmTouched: false,
    handOut: false,
    rulesProfile: PRCA,
  };
  assert.equal(scoreBarebackRide({ ...base, freeArmTouched: true }).status, 'no_score');
  assert.equal(scoreBarebackRide({ ...base, handOut: true }).status, 'no_score');
  assert.equal(scoreBarebackRide(base).officialScore, 86);
});
