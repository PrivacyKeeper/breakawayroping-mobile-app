// src/lib/scoring/ranchrodeo/index.ts
//
// Ranch rodeo. The only team-scored app in the portfolio, and the only one
// where the thing being ranked is not a time or a score but points across a
// card of compulsory events.
//
// The points scale is the part that has to be data. The WRCA sanctioned
// pattern descends from the team count; the Texas Ranch Round-Up uses a fixed
// 10/7/5/3/1 table. Both are published, both are current, and producers each
// have their own arithmetic that they will not change for an app. Ship both
// presets plus a custom table builder.

import { type RulesProfile, profileNumber } from '../types.ts';

export type RanchEvent =
  | 'ranch_bronc'
  | 'stray_gathering'
  | 'wild_cow_milking'
  | 'team_branding'
  | 'number_sorting'
  | 'doctoring'
  | 'team_penning'
  | 'trailer_loading'
  | 'wild_horse_race';

export type PointsScale =
  | { type: 'descending_from_team_count'; start: 'team_count' | number }
  | { type: 'fixed_table'; table: Record<string, number> };

export const WRCA_SANCTIONED_SCALE: PointsScale = {
  type: 'descending_from_team_count',
  start: 'team_count',
};

export const TEXAS_RANCH_ROUND_UP_SCALE: PointsScale = {
  type: 'fixed_table',
  table: { '1': 10, '2': 7, '3': 5, '4': 3, '5': 1 },
};

/** 30 seconds is the standard penalty across the ranch rodeo card. */
export const RR_PENALTIES = {
  EARLY_START: { seconds: 30, rule: 'Crossed the start line before the flag dropped' },
  LOPING_IN_HERD: { seconds: 30, rule: 'Loping in the herd or while dragging' },
  MULTIPLE_IN_HERD: { seconds: 30, rule: 'More than one rider in the herd at a time' },
  ROPED_OUTSIDE_LINE: { seconds: 30, rule: 'Roping outside the line' },
  EARLY_FLANK: { seconds: 30, rule: 'Flanker touched the calf before it crossed the line' },
  HORSE_IN_CIRCLE: { seconds: 30, rule: 'Horse entered the judge’s circle' },
  OUT_OF_SEQUENCE: { status: 'no_time', rule: 'Yearling cut out of sequence' },
  HERD_BROKE_LINE: { status: 'no_time', rule: 'The herd broke the line' },
  SPOTTERS_USED: { status: 'no_time', rule: 'Spotters used to help the sorter' },
  COW_DOWN_WHEN_MILKED: { status: 'no_time', rule: 'The cow must be standing when milked' },
  ROPE_ON_HORN: { status: 'no_time', rule: 'The rope must be off the horn before milking' },
  MILK_WILL_NOT_POUR: { status: 'no_time', rule: 'Milk must pour within the judge’s count of five' },
  TIE_FAILED_6S: { status: 'no_time', rule: 'Both steers must stay tied for six seconds' },
  TIME_LIMIT: { status: 'no_time', rule: 'Exceeded the two minute limit' },
  ROUGH_HANDLING: { status: 'dq', rule: 'Unnecessary roughness' },
} as const;

export interface EventRunInput {
  teamId: string;
  event: RanchEvent;
  rawTimeMs: number | null;
  /** Ranch bronc is judged; every other event on the card is timed. */
  score: number | null;
  penaltyCodes: string[];
  noTime: boolean;
  rulesProfile: RulesProfile;
}

export interface EventRunResult {
  teamId: string;
  event: RanchEvent;
  officialTimeMs: number | null;
  officialScore: number | null;
  penaltySeconds: number;
  noTime: boolean;
  explanation: string;
}

export function scoreRanchEventRun(input: EventRunInput): EventRunResult {
  const p = input.rulesProfile;
  const cite = (rule: string) => `${rule} (${p.edition})`;

  let penaltySeconds = 0;
  const applied: string[] = [];
  let disqualifying: string | null = null;

  for (const code of input.penaltyCodes) {
    const penalty = RR_PENALTIES[code as keyof typeof RR_PENALTIES];
    if (!penalty) continue;
    if ('seconds' in penalty) {
      penaltySeconds += penalty.seconds;
      applied.push(`${penalty.seconds}s ${cite(penalty.rule)}`);
    } else {
      disqualifying = cite(penalty.rule);
    }
  }

  if (input.noTime || disqualifying) {
    return {
      teamId: input.teamId,
      event: input.event,
      officialTimeMs: null,
      officialScore: null,
      penaltySeconds,
      noTime: true,
      explanation: `No time — ${disqualifying ?? 'did not complete'}.`,
    };
  }

  // Ranch bronc: ride as ride can for eight seconds, no mark-out rule.
  if (input.score !== null) {
    return {
      teamId: input.teamId,
      event: input.event,
      officialTimeMs: null,
      officialScore: input.score,
      penaltySeconds: 0,
      noTime: false,
      explanation: `${input.score} points.`,
    };
  }

  if (input.rawTimeMs === null) {
    return {
      teamId: input.teamId,
      event: input.event,
      officialTimeMs: null,
      officialScore: null,
      penaltySeconds,
      noTime: true,
      explanation: 'No time recorded.',
    };
  }

  const officialTimeMs = input.rawTimeMs + penaltySeconds * 1000;
  const limitSeconds = profileNumber(p, 'event_time_limit_seconds', 120);
  if (officialTimeMs > limitSeconds * 1000) {
    return {
      teamId: input.teamId,
      event: input.event,
      officialTimeMs: null,
      officialScore: null,
      penaltySeconds,
      noTime: true,
      explanation: `No time — ${cite(RR_PENALTIES.TIME_LIMIT.rule)}.`,
    };
  }

  return {
    teamId: input.teamId,
    event: input.event,
    officialTimeMs,
    officialScore: null,
    penaltySeconds,
    noTime: false,
    explanation: applied.length
      ? `${(officialTimeMs / 1000).toFixed(2)}, including ${applied.join(' and ')}.`
      : `${(officialTimeMs / 1000).toFixed(2)}.`,
  };
}

// ---------------------------------------------------------------------------
// Points
// ---------------------------------------------------------------------------

export interface EventPlacing {
  teamId: string;
  place: number;
  noTime: boolean;
}

/**
 * Award points for one event, one round.
 *
 * No time equals no points under either published scale, which is why
 * noTime is carried through the placing rather than being filtered out
 * earlier — a team that competed and no-timed is not the same as a team that
 * did not enter, and the all-events bonus below depends on the difference.
 */
export function awardEventPoints(
  placings: EventPlacing[],
  scale: PointsScale,
  teamCount: number,
): Array<{ teamId: string; points: number }> {
  return placings.map((placing) => {
    if (placing.noTime) return { teamId: placing.teamId, points: 0 };

    if (scale.type === 'fixed_table') {
      return {
        teamId: placing.teamId,
        points: scale.table[String(placing.place)] ?? 0,
      };
    }

    const start = scale.start === 'team_count' ? teamCount : scale.start;
    return {
      teamId: placing.teamId,
      points: Math.max(0, start - (placing.place - 1)),
    };
  });
}

export interface TeamStanding {
  teamId: string;
  totalPoints: number;
  /** Points by event, for the tiebreaker walk and for the standings screen. */
  pointsByEvent: Record<string, number>;
  competedInAllEvents: boolean;
  bonusPoints: number;
  rank: number;
}

export interface StandingsInput {
  teamIds: string[];
  compulsoryEvents: RanchEvent[];
  /** One entry per team per event per round. */
  awards: Array<{ teamId: string; event: RanchEvent; round: number; points: number }>;
  /** Teams that posted a time or score in every event, per round. */
  entered: Array<{ teamId: string; event: RanchEvent; round: number }>;
  bonusForAllEvents: number;
  /** Producer-configurable and published before the rodeo. */
  tiebreakers: Array<'total_points' | RanchEvent>;
}

/**
 * Champion is the highest total across both rounds.
 *
 * Ties are broken by the producer's published order — most points overall,
 * then branding, then doctoring, and so on. The order varies by producer and
 * must be published beforehand, so it is an input rather than a constant.
 */
export function computeStandings(input: StandingsInput): TeamStanding[] {
  const standings = input.teamIds.map((teamId) => {
    const pointsByEvent: Record<string, number> = {};
    let totalPoints = 0;

    for (const award of input.awards) {
      if (award.teamId !== teamId) continue;
      pointsByEvent[award.event] = (pointsByEvent[award.event] ?? 0) + award.points;
      totalPoints += award.points;
    }

    // All teams must enter every compulsory event to be eligible for the team
    // championship, and the bonus rewards actually competing in all of them.
    const enteredEvents = new Set(
      input.entered.filter((e) => e.teamId === teamId).map((e) => e.event),
    );
    const competedInAllEvents = input.compulsoryEvents.every((e) => enteredEvents.has(e));
    const bonusPoints = competedInAllEvents ? input.bonusForAllEvents : 0;

    return {
      teamId,
      totalPoints: totalPoints + bonusPoints,
      pointsByEvent,
      competedInAllEvents,
      bonusPoints,
      rank: 0,
    };
  });

  standings.sort((a, b) => {
    for (const key of input.tiebreakers) {
      const aValue = key === 'total_points' ? a.totalPoints : (a.pointsByEvent[key] ?? 0);
      const bValue = key === 'total_points' ? b.totalPoints : (b.pointsByEvent[key] ?? 0);
      if (aValue !== bValue) return bValue - aValue;
    }
    return 0;
  });

  // Standard competition ranking: genuine ties share a rank and the next
  // rank skips accordingly.
  let previous: TeamStanding | null = null;
  standings.forEach((standing, index) => {
    if (previous && tiedWith(previous, standing, input.tiebreakers)) {
      standing.rank = previous.rank;
    } else {
      standing.rank = index + 1;
    }
    previous = standing;
  });

  return standings;
}

function tiedWith(
  a: TeamStanding,
  b: TeamStanding,
  tiebreakers: StandingsInput['tiebreakers'],
): boolean {
  return tiebreakers.every((key) => {
    const aValue = key === 'total_points' ? a.totalPoints : (a.pointsByEvent[key] ?? 0);
    const bValue = key === 'total_points' ? b.totalPoints : (b.pointsByEvent[key] ?? 0);
    return aValue === bValue;
  });
}

/**
 * Once an original participant is replaced by an alternate, that participant
 * cannot return to the competition. Enforced here as well as in the roster
 * editor so the rule holds regardless of which screen wrote the change.
 */
export function canRejoinRoster(
  replacedRiderIds: readonly string[],
  riderId: string,
): { allowed: boolean; reason: string } {
  if (replacedRiderIds.includes(riderId)) {
    return {
      allowed: false,
      reason:
        'This rider was replaced by an alternate and cannot return to the competition.',
    };
  }
  return { allowed: true, reason: '' };
}
