// src/lib/scoring/steerwrestling/index.ts
//
// Steer wrestling. After breakaway, the simplest engine in the portfolio:
// one additive penalty and a binary legal-fall judgment.
//
// The thing that makes this event different is not in the scoring at all —
// it is that you physically cannot compete without a hazer, and the hazer is
// owed a share of what you win. See creditHazer() at the bottom.

import {
  type AppliedPenalty,
  type RulesProfile,
  type RunOutcome,
  formatTime,
  profileBool,
  profileNumber,
  requireNumber,
} from '../types.ts';

export const SW_PENALTIES = {
  BARRIER: { rule: 'Broken barrier' },
  ILLEGAL_FALL: { rule: 'Steer must be on its side, four feet and head the same direction' },
  STEER_DOWN_EARLY: { rule: 'Steer must be on its feet and under control before it is thrown' },
  MISSED_STEER: { rule: 'Missed steer' },
  TIME_LIMIT: { rule: 'Exceeded the arena time limit' },
  HAZER_INTERFERENCE: { rule: 'Hazer interference' },
  ROUGH_HANDLING: { rule: 'Unnecessary roughness, including twisting the neck after the fall' },
  NO_HAZER: { rule: 'Cannot compete without a hazer' },
} as const;

export interface SteerWrestlingRunInput {
  rawTimeMs: number | null;
  caught: boolean;
  /** Four feet and head pointing the same direction. Anything else is not down. */
  legalFall: boolean;
  /** Steer went down before it was up and under control — must be let up. */
  steerDownEarly: boolean;
  barrierBroken: boolean;
  hazerId: string | null;
  hazerInterference?: boolean;
  roughHandling?: boolean;
  rulesProfile: RulesProfile;
}

export function scoreSteerWrestlingRun(input: SteerWrestlingRunInput): RunOutcome {
  const p = input.rulesProfile;
  const cite = (rule: string) => `${rule} (${p.edition})`;
  const penalties: AppliedPenalty[] = [];

  // Not a scoring outcome so much as a gate — surfaced here so an entry
  // without a hazer cannot quietly reach the scoring screen.
  if (!input.hazerId) {
    return {
      status: 'no_time',
      appliedPenalties: [{ code: 'NO_HAZER', rule: cite(SW_PENALTIES.NO_HAZER.rule) }],
      explanation: `No time — ${cite(SW_PENALTIES.NO_HAZER.rule)}.`,
    };
  }

  if (input.roughHandling) {
    return fail('dq', 'ROUGH_HANDLING', SW_PENALTIES.ROUGH_HANDLING.rule, cite, penalties);
  }

  // Hazer interference is association-dependent, so it is gated rather than
  // always fatal.
  if (input.hazerInterference && profileBool(p, 'hazer_interference_no_times', true)) {
    return fail('no_time', 'HAZER_INTERFERENCE', SW_PENALTIES.HAZER_INTERFERENCE.rule, cite, penalties);
  }

  if (!input.caught || input.rawTimeMs === null) {
    return fail('no_time', 'MISSED_STEER', SW_PENALTIES.MISSED_STEER.rule, cite, penalties);
  }

  const timeLimitSeconds = profileNumber(p, 'time_limit_seconds', 30);
  if (input.rawTimeMs > timeLimitSeconds * 1000) {
    return fail('no_time', 'TIME_LIMIT', SW_PENALTIES.TIME_LIMIT.rule, cite, penalties);
  }

  if (input.steerDownEarly) {
    return fail('no_time', 'STEER_DOWN_EARLY', SW_PENALTIES.STEER_DOWN_EARLY.rule, cite, penalties);
  }
  if (!input.legalFall) {
    return fail('no_time', 'ILLEGAL_FALL', SW_PENALTIES.ILLEGAL_FALL.rule, cite, penalties);
  }

  let officialTimeMs = input.rawTimeMs;
  if (input.barrierBroken) {
    const barrierSeconds = requireNumber(p, 'barrier_seconds');
    officialTimeMs += barrierSeconds * 1000;
    penalties.push({
      code: 'BARRIER',
      seconds: barrierSeconds,
      rule: cite(SW_PENALTIES.BARRIER.rule),
    });
  }

  const barrierNote = input.barrierBroken
    ? ` Includes a ${formatTime(officialTimeMs - input.rawTimeMs)} second barrier penalty.`
    : '';

  return {
    status: input.barrierBroken ? 'penalty' : 'clean',
    officialTimeMs,
    appliedPenalties: penalties,
    explanation: `${formatTime(officialTimeMs)} on a legal fall.${barrierNote}`,
    provisional: true,
  };
}

function fail(
  status: RunOutcome['status'],
  code: string,
  rule: string,
  cite: (r: string) => string,
  carried: AppliedPenalty[],
): RunOutcome {
  const label = status === 'dq' ? 'Disqualified' : 'No time';
  return {
    status,
    appliedPenalties: [...carried, { code, rule: cite(rule) }],
    explanation: `${label} — ${cite(rule)}.`,
  };
}

// ---------------------------------------------------------------------------
// Hazer credit
// ---------------------------------------------------------------------------

export interface HazerCredit {
  hazerId: string;
  sharePct: number;
  amountCents: number;
  wrestlerAmountCents: number;
}

/**
 * Split a placing between the wrestler and the hazer.
 *
 * Integer cents throughout, with the remainder going to the wrestler, so the
 * two lines always add back to exactly what was won. Cent drift in a payout
 * is how a ledger stops being trusted, and this whole feature exists to make
 * the after-the-rodeo argument disappear.
 */
export function creditHazer(
  winningsCents: number,
  hazerId: string,
  sharePct: number,
): HazerCredit {
  if (sharePct < 0 || sharePct > 100) {
    throw new Error(`Hazer share must be between 0 and 100, got ${sharePct}`);
  }
  const hazerAmount = Math.floor((winningsCents * sharePct) / 100);
  return {
    hazerId,
    sharePct,
    amountCents: hazerAmount,
    wrestlerAmountCents: winningsCents - hazerAmount,
  };
}
