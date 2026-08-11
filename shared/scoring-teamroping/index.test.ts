import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { RulesProfile } from '../types.ts';
import {
  checkDivisionEligibility,
  checkTieOnEligibility,
  scoreTeamRopingRun,
  type DivisionRule,
  type Roper,
  type TeamRopingRunInput,
} from './index.ts';

const USTRC: RulesProfile = {
  ruleSetId: 'ustrc-2026',
  edition: 'USTRC 2026',
  associationCode: 'USTRC',
  values: {
    barrier_seconds: 5,
    one_hind_foot_seconds: 5,
    crossfire_standard: 'loop_release',
    finish_mode: 'face',
  },
};

const PRCA: RulesProfile = {
  ruleSetId: 'prca-2026',
  edition: 'PRCA 2026 Rule Book',
  associationCode: 'PRCA',
  values: {
    barrier_seconds: 10,
    one_hind_foot_seconds: 5,
    crossfire_standard: 'loop_contact',
    finish_mode: 'face',
  },
};

function roper(overrides: Partial<Roper> = {}): Roper {
  return {
    id: 'r1',
    headerNumber: 5,
    heelerNumber: 5,
    elite: false,
    dateOfBirth: '1990-06-15',
    gender: 'male',
    ...overrides,
  };
}

function run(overrides: Partial<TeamRopingRunInput> = {}): TeamRopingRunInput {
  return {
    rawTimeMs: 7200,
    headCatch: 'both_horns',
    heelCatch: 'two_feet',
    frontFootFreedBeforeTime: false,
    barrierBroken: false,
    heelLoopReleasedBeforeTow: false,
    heelLoopContactBeforeTow: false,
    bothDallied: true,
    bothFaced: true,
    bothMounted: true,
    steerStanding: true,
    headerTiedOn: false,
    heelerTiedOn: false,
    heelerTieOnEligible: true,
    rulesProfile: USTRC,
    ...overrides,
  };
}

// --- The barrier difference, which is the most common misconfiguration -----

test('USTRC is a five second barrier and PRCA is ten', () => {
  const ustrc = scoreTeamRopingRun(run({ barrierBroken: true }));
  assert.equal(ustrc.officialTimeMs, 12_200);

  const prca = scoreTeamRopingRun(run({ barrierBroken: true, rulesProfile: PRCA }));
  assert.equal(prca.officialTimeMs, 17_200);
});

// --- Crossfire, judged differently by association -------------------------

test('crossfire is judged on release under USTRC and on contact under PRCA', () => {
  // Heeler released before the steer was in tow but the loop made contact
  // after. Illegal under USTRC, legal under PRCA.
  const input = { heelLoopReleasedBeforeTow: true, heelLoopContactBeforeTow: false };

  const ustrc = scoreTeamRopingRun(run(input));
  assert.equal(ustrc.status, 'no_time');
  assert.equal(ustrc.appliedPenalties.at(-1)?.code, 'CROSSFIRE');

  const prca = scoreTeamRopingRun(run({ ...input, rulesProfile: PRCA }));
  assert.equal(prca.status, 'clean');
});

// --- Catches ---------------------------------------------------------------

test('the three legal head catches score and the rest do not', () => {
  for (const headCatch of ['both_horns', 'half_head', 'neck'] as const) {
    assert.equal(scoreTeamRopingRun(run({ headCatch })).status, 'clean');
  }
  for (const headCatch of ['horn_hondo_cross', 'crossed_loop', 'bridle', 'leg'] as const) {
    assert.equal(scoreTeamRopingRun(run({ headCatch })).status, 'no_time');
  }
});

test('one hind foot adds five seconds rather than no-timing the run', () => {
  const outcome = scoreTeamRopingRun(run({ heelCatch: 'one_foot' }));
  assert.equal(outcome.status, 'penalty');
  assert.equal(outcome.officialTimeMs, 12_200);
  assert.equal(outcome.appliedPenalties.at(-1)?.code, 'ONE_HIND_FOOT');
});

test('a front foot counts only if it comes free before time is called', () => {
  assert.equal(
    scoreTeamRopingRun(run({ heelCatch: 'front_foot', frontFootFreedBeforeTime: false })).status,
    'no_time',
  );
  assert.equal(
    scoreTeamRopingRun(run({ heelCatch: 'front_foot', frontFootFreedBeforeTime: true })).status,
    'clean',
  );
});

test('facing is required in a face class and not in a heel-flag class', () => {
  assert.equal(scoreTeamRopingRun(run({ bothFaced: false })).status, 'no_time');

  const heelFlag: RulesProfile = {
    ...USTRC,
    values: { ...USTRC.values, finish_mode: 'heel_flag' },
  };
  assert.equal(
    scoreTeamRopingRun(run({ bothFaced: false, rulesProfile: heelFlag })).status,
    'clean',
  );
});

test('a header tying on is an automatic disqualification, full stop', () => {
  const outcome = scoreTeamRopingRun(run({ headerTiedOn: true }));
  assert.equal(outcome.status, 'dq');
  assert.equal(outcome.appliedPenalties[0]?.code, 'HEADER_TIED_ON');
});

test('a time stays provisional so a flagger can reverse it', () => {
  // The flagger may retroactively flag a team out after a time is taken for
  // something not visible at the moment of the flag.
  assert.equal(scoreTeamRopingRun(run()).provisional, true);
});

// --- Classification --------------------------------------------------------

const D15: DivisionRule = {
  division: 15,
  cap: null,
  floor: { headerAtLeast: 6, heelerAtLeast: 7 },
  eliteCap: null,
};
const D10: DivisionRule = { division: 10, cap: null, floor: null, eliteCap: 6 };

test('team number is the two ends added together', () => {
  const result = checkDivisionEligibility(
    roper({ headerNumber: 5.5 }),
    roper({ id: 'r2', heelerNumber: 4.5 }),
    D10,
  );
  assert.equal(result.teamNumber, 10);
  assert.equal(result.eligible, true);
});

test('half numbers survive — the scale is not integers', () => {
  const result = checkDivisionEligibility(
    roper({ headerNumber: 5.5 }),
    roper({ id: 'r2', heelerNumber: 5.5 }),
    D10,
  );
  assert.equal(result.teamNumber, 11);
  assert.equal(result.eligible, false);
});

test('two Elite ropers must go up a division', () => {
  const result = checkDivisionEligibility(
    roper({ headerNumber: 5, elite: true }),
    roper({ id: 'r2', heelerNumber: 5, elite: true }),
    D10,
  );
  assert.equal(result.eligible, false);
  assert.ok(result.reasons.some((r) => r.includes('Elite')));
});

test('one Elite roper with a plain partner is fine at the same division', () => {
  const result = checkDivisionEligibility(
    roper({ headerNumber: 5, elite: true }),
    roper({ id: 'r2', heelerNumber: 5, elite: false }),
    D10,
  );
  assert.equal(result.eligible, true);
});

test('the higher divisions need a minimum on at least one end', () => {
  const tooLow = checkDivisionEligibility(
    roper({ headerNumber: 5 }),
    roper({ id: 'r2', heelerNumber: 5 }),
    D15,
  );
  assert.ok(tooLow.reasons.some((r) => r.includes('at least')));

  const meetsFloor = checkDivisionEligibility(
    roper({ headerNumber: 6 }),
    roper({ id: 'r2', heelerNumber: 5 }),
    D15,
  );
  assert.equal(meetsFloor.eligible, true);
});

test('every reason is reported at once, not one at a time', () => {
  const result = checkDivisionEligibility(
    roper({ headerNumber: 9, elite: true }),
    roper({ id: 'r2', heelerNumber: 9, elite: true }),
    D10,
  );
  assert.ok(result.reasons.length >= 2);
});

// --- Tie-on eligibility ----------------------------------------------------

test('a female heeler becomes eligible on her 13th birthday, to the day', () => {
  const heeler = roper({ gender: 'female', dateOfBirth: '2013-06-15' });

  const dayBefore = checkTieOnEligibility(heeler, new Date('2026-06-14T00:00:00Z'));
  assert.equal(dayBefore.eligible, false);

  const birthday = checkTieOnEligibility(heeler, new Date('2026-06-15T00:00:00Z'));
  assert.equal(birthday.eligible, true);
});

test('no one twelve or under may tie on, ever', () => {
  const child = roper({ gender: 'female', dateOfBirth: '2015-01-01' });
  assert.equal(checkTieOnEligibility(child, new Date('2026-08-01T00:00:00Z')).eligible, false);
});

test('male heelers tie on at 60, or at 55 when classified 5.5 or below', () => {
  const sixty = roper({ gender: 'male', dateOfBirth: '1966-01-01', heelerNumber: 8 });
  assert.equal(checkTieOnEligibility(sixty, new Date('2026-08-01T00:00:00Z')).eligible, true);

  const fiftyFiveLow = roper({ gender: 'male', dateOfBirth: '1971-01-01', heelerNumber: 5.5 });
  assert.equal(
    checkTieOnEligibility(fiftyFiveLow, new Date('2026-08-01T00:00:00Z')).eligible,
    true,
  );

  const fiftyFiveHigh = roper({ gender: 'male', dateOfBirth: '1971-01-01', heelerNumber: 6 });
  assert.equal(
    checkTieOnEligibility(fiftyFiveHigh, new Date('2026-08-01T00:00:00Z')).eligible,
    false,
  );
});

test('an ineligible tie-on disqualifies the run', () => {
  const outcome = scoreTeamRopingRun(run({ heelerTiedOn: true, heelerTieOnEligible: false }));
  assert.equal(outcome.status, 'dq');
});
