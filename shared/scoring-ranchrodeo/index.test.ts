import assert from 'node:assert/strict';
import { test } from 'node:test';

import type { RulesProfile } from '../types.ts';
import {
  awardEventPoints,
  canRejoinRoster,
  computeStandings,
  scoreRanchEventRun,
  TEXAS_RANCH_ROUND_UP_SCALE,
  WRCA_SANCTIONED_SCALE,
  type RanchEvent,
} from './index.ts';

const WRCA: RulesProfile = {
  ruleSetId: 'wrca-2026',
  edition: 'WRCA 2026',
  associationCode: 'WRCA',
  values: { event_time_limit_seconds: 120 },
};

test('a 30 second penalty is added to the raw time', () => {
  const result = scoreRanchEventRun({
    teamId: 't1',
    event: 'team_branding',
    rawTimeMs: 62_000,
    score: null,
    penaltyCodes: ['LOPING_IN_HERD'],
    noTime: false,
    rulesProfile: WRCA,
  });
  assert.equal(result.officialTimeMs, 92_000);
  assert.equal(result.penaltySeconds, 30);
});

test('penalties stack and can push a run past the two minute limit', () => {
  const result = scoreRanchEventRun({
    teamId: 't1',
    event: 'team_branding',
    rawTimeMs: 70_000,
    score: null,
    penaltyCodes: ['LOPING_IN_HERD', 'ROPED_OUTSIDE_LINE'],
    noTime: false,
    rulesProfile: WRCA,
  });
  assert.equal(result.noTime, true);
  assert.match(result.explanation, /two minute limit/);
});

test('cutting out of sequence is a no time, not a penalty', () => {
  const result = scoreRanchEventRun({
    teamId: 't1',
    event: 'number_sorting',
    rawTimeMs: 80_000,
    score: null,
    penaltyCodes: ['OUT_OF_SEQUENCE'],
    noTime: false,
    rulesProfile: WRCA,
  });
  assert.equal(result.noTime, true);
  assert.equal(result.officialTimeMs, null);
});

test('the WRCA scale descends from the team count', () => {
  const points = awardEventPoints(
    [
      { teamId: 'a', place: 1, noTime: false },
      { teamId: 'b', place: 2, noTime: false },
      { teamId: 'c', place: 3, noTime: false },
    ],
    WRCA_SANCTIONED_SCALE,
    14,
  );
  assert.deepEqual(points, [
    { teamId: 'a', points: 14 },
    { teamId: 'b', points: 13 },
    { teamId: 'c', points: 12 },
  ]);
});

test('the Texas Ranch Round-Up scale is a fixed table', () => {
  const points = awardEventPoints(
    [
      { teamId: 'a', place: 1, noTime: false },
      { teamId: 'b', place: 2, noTime: false },
      { teamId: 'f', place: 6, noTime: false },
    ],
    TEXAS_RANCH_ROUND_UP_SCALE,
    14,
  );
  assert.deepEqual(points, [
    { teamId: 'a', points: 10 },
    { teamId: 'b', points: 7 },
    { teamId: 'f', points: 0 },
  ]);
});

test('no time equals no points under either scale', () => {
  const wrca = awardEventPoints([{ teamId: 'a', place: 1, noTime: true }], WRCA_SANCTIONED_SCALE, 14);
  assert.equal(wrca[0]?.points, 0);

  const texas = awardEventPoints(
    [{ teamId: 'a', place: 1, noTime: true }],
    TEXAS_RANCH_ROUND_UP_SCALE,
    14,
  );
  assert.equal(texas[0]?.points, 0);
});

const COMPULSORY: RanchEvent[] = [
  'ranch_bronc',
  'stray_gathering',
  'wild_cow_milking',
  'team_branding',
  'number_sorting',
];

test('the all-events bonus only lands for a team that competed in all of them', () => {
  const standings = computeStandings({
    teamIds: ['a', 'b'],
    compulsoryEvents: COMPULSORY,
    awards: [
      ...COMPULSORY.map((event) => ({ teamId: 'a', event, round: 1, points: 10 })),
      ...COMPULSORY.map((event) => ({ teamId: 'b', event, round: 1, points: 10 })),
    ],
    entered: [
      ...COMPULSORY.map((event) => ({ teamId: 'a', event, round: 1 })),
      // b skipped the bronc riding
      ...COMPULSORY.filter((e) => e !== 'ranch_bronc').map((event) => ({
        teamId: 'b',
        event,
        round: 1,
      })),
    ],
    bonusForAllEvents: 10,
    tiebreakers: ['total_points'],
  });

  const a = standings.find((s) => s.teamId === 'a');
  const b = standings.find((s) => s.teamId === 'b');
  assert.equal(a?.bonusPoints, 10);
  assert.equal(a?.totalPoints, 60);
  assert.equal(b?.bonusPoints, 0);
  assert.equal(b?.totalPoints, 50);
  assert.equal(a?.rank, 1);
});

test('ties break on the producer’s published order', () => {
  const standings = computeStandings({
    teamIds: ['a', 'b'],
    compulsoryEvents: [],
    awards: [
      { teamId: 'a', event: 'team_branding', round: 1, points: 5 },
      { teamId: 'a', event: 'number_sorting', round: 1, points: 15 },
      { teamId: 'b', event: 'team_branding', round: 1, points: 15 },
      { teamId: 'b', event: 'number_sorting', round: 1, points: 5 },
    ],
    entered: [],
    bonusForAllEvents: 0,
    // Equal on total; branding decides.
    tiebreakers: ['total_points', 'team_branding'],
  });

  assert.equal(standings[0]?.teamId, 'b');
  assert.equal(standings[0]?.rank, 1);
  assert.equal(standings[1]?.rank, 2);
});

test('a genuinely tied pair shares a rank', () => {
  const standings = computeStandings({
    teamIds: ['a', 'b'],
    compulsoryEvents: [],
    awards: [
      { teamId: 'a', event: 'team_branding', round: 1, points: 10 },
      { teamId: 'b', event: 'team_branding', round: 1, points: 10 },
    ],
    entered: [],
    bonusForAllEvents: 0,
    tiebreakers: ['total_points', 'team_branding'],
  });
  assert.equal(standings[0]?.rank, 1);
  assert.equal(standings[1]?.rank, 1);
});

test('a rider replaced by an alternate cannot come back', () => {
  assert.equal(canRejoinRoster(['r1'], 'r1').allowed, false);
  assert.equal(canRejoinRoster(['r1'], 'r2').allowed, true);
});
