// src/lib/scoring/tiedown/index.ts
//
// Tie-down roping. Catch as catch can, so there is no catch legality to
// judge — the engine is almost entirely binary outcomes plus one additive
// barrier penalty. The product value is not in the score, it is in the
// segment breakdown below: a roper does not want to know he was 8.4, he
// wants to know he was 2.3 to the catch, 1.1 off the horse and 3.2 in the tie.

import {
  type AppliedPenalty,
  type RulesProfile,
  type RunOutcome,
  formatTime,
  profileBool,
  profileNumber,
  requireNumber,
} from '../types.ts';

export const TD_PENALTIES = {
  BARRIER: { rule: 'Broken barrier' },
  NO_CATCH: { rule: 'No catch' },
  TIE_FAILED_6S: { rule: 'Three legs must stay tied for six seconds' },
  ILLEGAL_TIE: { rule: 'At least one wrap around all three legs and a half hitch' },
  CALF_NOT_THROWN_BY_HAND: { rule: 'A calf already down must be let up and thrown by hand' },
  ROPE_SLACK_EARLY: { rule: 'The rope must stay slack until the judge approves the tie' },
  JERK_DOWN: { rule: 'Calf jerked off all four feet before the roper reaches it' },
  TIME_LIMIT: { rule: 'Exceeded the arena time limit' },
  DRAGGING_UNINT: { rule: 'Unintentional dragging' },
  DRAGGING_INT: { rule: 'Intentional dragging' },
  ROUGH_HANDLING: { rule: 'Rough handling' },
} as const;

export interface TieDownRunInput {
  rawTimeMs: number | null;
  caught: boolean;
  /** If the calf was down on arrival it must be let up and thrown by hand. */
  calfThrownByHand: boolean;
  legsTied: number;
  wrapAndHooey: boolean;
  /** Judge's six-second timer completed with the tie intact. */
  tieHeld: boolean;
  ropeStayedSlack: boolean;
  barrierBroken: boolean;
  loopsThrown: number;
  /**
   * Calf jerked off all four feet with back or head touching ground before
   * the roper reaches it. Enforced under PRCA and increasingly by amateur
   * associations, but NOT universal — one of the rules with the most
   * variation, so it is gated on the profile rather than always applied.
   */
  jerkDown: boolean;
  dragging?: 'none' | 'unintentional' | 'intentional';
  roughHandling?: boolean;
  rulesProfile: RulesProfile;
}

export function scoreTieDownRun(input: TieDownRunInput): RunOutcome {
  const p = input.rulesProfile;
  const cite = (rule: string) => `${rule} (${p.edition})`;
  const penalties: AppliedPenalty[] = [];

  if (input.roughHandling) {
    return fail('dq', 'ROUGH_HANDLING', TD_PENALTIES.ROUGH_HANDLING.rule, cite, penalties);
  }
  if (input.dragging === 'intentional') {
    return fail('dq', 'DRAGGING_INT', TD_PENALTIES.DRAGGING_INT.rule, cite, penalties);
  }
  if (input.dragging === 'unintentional') {
    // A fine, not a disqualification — recorded against the run and carried
    // through so the settlement picks it up, but the time still stands.
    penalties.push({ code: 'DRAGGING_UNINT', rule: cite(TD_PENALTIES.DRAGGING_UNINT.rule) });
  }

  // Jerk-down only disqualifies where the association enforces it.
  if (input.jerkDown && profileBool(p, 'jerk_down_disqualifies', true)) {
    return fail('no_time', 'JERK_DOWN', TD_PENALTIES.JERK_DOWN.rule, cite, penalties);
  }

  if (!input.caught || input.rawTimeMs === null) {
    return fail('no_time', 'NO_CATCH', TD_PENALTIES.NO_CATCH.rule, cite, penalties);
  }

  const loopLimit = profileNumber(p, 'loops', 1);
  if (input.loopsThrown > loopLimit) {
    return fail(
      'no_time',
      'NO_CATCH',
      `Exceeded the ${loopLimit} loop limit for this class`,
      cite,
      penalties,
    );
  }

  const timeLimitSeconds = profileNumber(p, 'time_limit_seconds', 30);
  if (input.rawTimeMs > timeLimitSeconds * 1000) {
    return fail('no_time', 'TIME_LIMIT', TD_PENALTIES.TIME_LIMIT.rule, cite, penalties);
  }

  if (!input.calfThrownByHand) {
    return fail(
      'no_time',
      'CALF_NOT_THROWN_BY_HAND',
      TD_PENALTIES.CALF_NOT_THROWN_BY_HAND.rule,
      cite,
      penalties,
    );
  }
  if (input.legsTied < 3 || !input.wrapAndHooey) {
    return fail('no_time', 'ILLEGAL_TIE', TD_PENALTIES.ILLEGAL_TIE.rule, cite, penalties);
  }
  if (!input.ropeStayedSlack) {
    return fail('no_time', 'ROPE_SLACK_EARLY', TD_PENALTIES.ROPE_SLACK_EARLY.rule, cite, penalties);
  }
  if (!input.tieHeld) {
    return fail('no_time', 'TIE_FAILED_6S', TD_PENALTIES.TIE_FAILED_6S.rule, cite, penalties);
  }

  let officialTimeMs = input.rawTimeMs;
  if (input.barrierBroken) {
    const barrierSeconds = requireNumber(p, 'barrier_seconds');
    officialTimeMs += barrierSeconds * 1000;
    penalties.push({
      code: 'BARRIER',
      seconds: barrierSeconds,
      rule: cite(TD_PENALTIES.BARRIER.rule),
    });
  }

  const barrierNote = input.barrierBroken
    ? ` Includes a ${formatTime(officialTimeMs - input.rawTimeMs)} second barrier penalty.`
    : '';

  return {
    status: input.barrierBroken ? 'penalty' : 'clean',
    officialTimeMs,
    appliedPenalties: penalties,
    explanation: `${formatTime(officialTimeMs)}, tie held for six seconds.${barrierNote}`,
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
// Segments — the actual product
// ---------------------------------------------------------------------------

export interface TieDownSegments {
  barrierBreakMs: number;
  leaveBoxMs: number;
  catchMs: number;
  slackPulledMs: number;
  dismountMs: number;
  downTheRopeMs: number;
  flankMs: number;
  stringOnMs: number;
  tieCompleteMs: number;
  remountMs: number;
  horseStepMs: number;
  judgeApproveMs: number;
}

export interface SegmentBreakdown {
  timeToCatchMs: number;
  /** Catch to feet on the ground. Ropers lose two or three tenths unaware. */
  dismountMs: number;
  downTheRopeMs: number;
  flankMs: number;
  /** String on to hands up. The most trainable segment and the most measurable. */
  tieMs: number;
  remountMs: number;
  /**
   * Share of the run attributable to the horse: the stop, the rate, and
   * holding the rope tight through the tie. Presented as an estimate, always
   * — this is a claim about an animal somebody paid six figures for.
   */
  horseShare: number;
}

export function breakdownSegments(s: TieDownSegments): SegmentBreakdown {
  const timeToCatchMs = s.catchMs - s.leaveBoxMs;
  const dismountMs = s.dismountMs - s.catchMs;
  const downTheRopeMs = s.downTheRopeMs - s.dismountMs;
  const flankMs = s.flankMs - s.downTheRopeMs;
  const tieMs = s.tieCompleteMs - s.stringOnMs;
  const remountMs = s.remountMs - s.tieCompleteMs;

  // The horse owns the run out of the box and the rope work; the roper owns
  // the ground segments. Down-the-rope is shared, because a horse that keeps
  // the rope tight is doing half of it.
  const total = Math.max(1, s.tieCompleteMs - s.leaveBoxMs);
  const horseMs = timeToCatchMs + downTheRopeMs * 0.5;

  return {
    timeToCatchMs,
    dismountMs,
    downTheRopeMs,
    flankMs,
    tieMs,
    remountMs,
    horseShare: Math.max(0, Math.min(1, horseMs / total)),
  };
}
