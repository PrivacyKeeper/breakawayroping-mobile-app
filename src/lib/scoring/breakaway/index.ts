// src/lib/scoring/breakaway/index.ts
//
// Breakaway roping. The fastest event in rodeo — a two-second run is a good
// one — which is exactly why the engine is stricter about time than the others
// in this portfolio.
//
// THE THING THAT MAKES THIS EVENT DIFFERENT
//
// The clock does not stop when the rope catches. It stops when the rope comes
// tight and the string breaks away from the saddle horn, and the flagger calls
// that moment. So there are two failure modes with no equivalent in tie-down:
//
//   * the rope never breaks away (the string held, or the roper never got
//     tight), and there is no time to record; and
//   * the rope breaks away EARLY — before the loop is around the neck — which
//     is not a slow run, it is no time.
//
// Both are modelled as explicit inputs rather than inferred from the clock,
// because a flagger's call is a fact about the run and guessing at it from a
// timestamp is how a contestant gets a no-time she cannot argue with.

import {
  type AppliedPenalty,
  type RulesProfile,
  type RunOutcome,
  formatTime,
  profileBool,
  profileNumber,
  requireBool,
  requireNumber,
} from '../types.ts';

export const BR_PENALTIES = {
  BARRIER: { rule: 'Broken barrier' },
  NO_CATCH: { rule: 'No catch' },
  ILLEGAL_CATCH: { rule: 'The loop must go over the head and draw tight around the neck' },
  ROPE_NOT_BROKEN: { rule: 'The rope must break away from the horn for a time to stand' },
  BREAKAWAY_EARLY: { rule: 'The rope broke away before the catch was complete' },
  TIME_LIMIT: { rule: 'Exceeded the arena time limit' },
  FLAG_NOT_VISIBLE: { rule: 'A bright flag must be attached to the end of the rope' },
  ROUGH_HANDLING: { rule: 'Rough handling' },
  DRAGGING_INT: { rule: 'Intentional dragging' },
} as const;

export interface BreakawayRunInput {
  /** From the flag, in milliseconds. Null when there was never a time. */
  rawTimeMs: number | null;
  caught: boolean;
  /**
   * A legal catch is around the neck. A figure-eight, a front leg or a horn
   * catch is not, and is a no time rather than a penalty.
   */
  catchLegal: boolean;
  /** The string parted from the horn — which is what stops the clock. */
  ropeBrokeAway: boolean;
  /** It parted before the loop drew tight. No time, not a slow time. */
  brokeAwayEarly: boolean;
  barrierBroken: boolean;
  loopsThrown: number;
  /**
   * WPRA requires a bright cloth of at least 12in square on the end of the
   * rope so the flagger can see the break. Whether a missing flag is a no time
   * or an equipment fine is an association matter, so it is gated.
   */
  flagAttached?: boolean;
  dragging?: 'none' | 'unintentional' | 'intentional';
  roughHandling?: boolean;
  rulesProfile: RulesProfile;
}

export function scoreBreakawayRun(input: BreakawayRunInput): RunOutcome {
  const p = input.rulesProfile;
  const cite = (rule: string) => `${rule} (${p.edition})`;
  const penalties: AppliedPenalty[] = [];

  if (input.roughHandling) {
    return fail('dq', 'ROUGH_HANDLING', BR_PENALTIES.ROUGH_HANDLING.rule, cite, penalties);
  }
  if (input.dragging === 'intentional') {
    return fail('dq', 'DRAGGING_INT', BR_PENALTIES.DRAGGING_INT.rule, cite, penalties);
  }

  // Equipment. `requireBool` rather than a default, on the same reasoning as
  // the tie-down jerk-down rule: this decides whether a run counts, and no
  // source we hold settles whether a missing flag is a no time or a fine.
  if (input.flagAttached === false && requireBool(p, 'missing_flag_no_times')) {
    return fail('no_time', 'FLAG_NOT_VISIBLE', BR_PENALTIES.FLAG_NOT_VISIBLE.rule, cite, penalties);
  }

  if (!input.caught) {
    return fail('no_time', 'NO_CATCH', BR_PENALTIES.NO_CATCH.rule, cite, penalties);
  }
  if (!input.catchLegal) {
    return fail('no_time', 'ILLEGAL_CATCH', BR_PENALTIES.ILLEGAL_CATCH.rule, cite, penalties);
  }

  // Order matters here. An early break is a distinct call from a rope that
  // never broke, and reporting the wrong one to a contestant is the difference
  // between "your string is set too light" and "you never got tight".
  if (input.brokeAwayEarly) {
    return fail('no_time', 'BREAKAWAY_EARLY', BR_PENALTIES.BREAKAWAY_EARLY.rule, cite, penalties);
  }
  if (!input.ropeBrokeAway || input.rawTimeMs === null) {
    return fail('no_time', 'ROPE_NOT_BROKEN', BR_PENALTIES.ROPE_NOT_BROKEN.rule, cite, penalties);
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
    return fail('no_time', 'TIME_LIMIT', BR_PENALTIES.TIME_LIMIT.rule, cite, penalties);
  }

  let officialTimeMs = input.rawTimeMs;

  if (input.barrierBroken) {
    // `requireNumber`, not a default. WPRA and PRCA assess 10 seconds and
    // USTRC-style ropings assess 5; guessing silently misprices every run in
    // the class, and in an event won by hundredths a wrong barrier is the
    // whole result.
    const barrierSeconds = requireNumber(p, 'barrier_seconds');
    officialTimeMs += barrierSeconds * 1000;
    penalties.push({
      code: 'BARRIER',
      seconds: barrierSeconds,
      rule: cite(BR_PENALTIES.BARRIER.rule),
    });
  }

  if (input.dragging === 'unintentional') {
    // A fine, not a disqualification. Recorded so settlement picks it up; the
    // time still stands.
    penalties.push({ code: 'DRAGGING_UNINT', rule: cite('Unintentional dragging') });
  }

  const clean = penalties.length === 0;
  return {
    status: clean ? 'clean' : 'penalty',
    officialTimeMs,
    appliedPenalties: penalties,
    explanation: clean
      ? `${formatTime(officialTimeMs)} seconds.`
      : `${formatTime(officialTimeMs)} seconds — ${penalties
          .map((x) => x.rule)
          .join('; ')}.`,
  };
}

function fail(
  status: 'no_time' | 'dq',
  code: string,
  rule: string,
  cite: (rule: string) => string,
  penalties: AppliedPenalty[],
): RunOutcome {
  const applied = [...penalties, { code, rule: cite(rule) }];
  return {
    status,
    appliedPenalties: applied,
    explanation: `${status === 'dq' ? 'Disqualified' : 'No time'} — ${cite(rule)}.`,
  };
}

/**
 * The two numbers a breakaway roper actually argues about.
 *
 * Everything in this event happens between the barrier and the flag, and the
 * only thing a roper can change week to week is how long she spends in the
 * box versus how long the loop is in the air. Splitting the run there is worth
 * more than the total, which she already knew from the announcer.
 */
export interface BreakawaySegments {
  /** Barrier to the loop leaving the hand. */
  deliveryMs: number | null;
  /** Delivery to the flag. */
  loopAndDrawMs: number | null;
}

export function breakdownSegments(
  totalMs: number | null,
  deliveryFrameMs: number | null,
): BreakawaySegments {
  if (totalMs === null || deliveryFrameMs === null) {
    return { deliveryMs: null, loopAndDrawMs: null };
  }
  if (deliveryFrameMs < 0 || deliveryFrameMs > totalMs) {
    // A delivery outside the run is a measurement fault, not a fast roper.
    // Returning nulls says "we do not know" rather than inventing a split.
    return { deliveryMs: null, loopAndDrawMs: null };
  }
  return {
    deliveryMs: deliveryFrameMs,
    loopAndDrawMs: totalMs - deliveryFrameMs,
  };
}

/** Kept exported so a caller can see the profile keys this engine reads. */
export const PROFILE_KEYS = [
  'barrier_seconds',
  'loops',
  'time_limit_seconds',
  'missing_flag_no_times',
] as const;

export { profileBool };
