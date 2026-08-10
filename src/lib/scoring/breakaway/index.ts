// src/lib/scoring/breakaway/index.ts
//
// Breakaway roping. The simplest engine in the portfolio: one additive
// penalty, one legal catch. Doing it exactly right makes the app immediately
// more accurate than the spreadsheets currently in use.
//
// Rule sources: WPRA rule 12.10.9 (equipment, amended 1 Oct 2025), PRCA 2026
// Rule Book Part 10 (barrier, timed events). Both dated, both carried in the
// rules profile rather than written into this file.

import {
  type AppliedPenalty,
  type RulesProfile,
  type RunOutcome,
  formatTime,
  profileBool,
  profileNumber,
  requireNumber,
} from '../types.ts';

/**
 * Exactly one legal catch: the bell collar. The calf's whole head passes
 * through, the loop draws up around the neck, no extremity inside it.
 */
export type CatchType =
  | 'bell_collar'
  | 'leg_in_loop'
  | 'half_head'
  | 'horn'
  | 'figure_eight'
  | 'no_catch';

export const BR_PENALTIES = {
  BARRIER: { rule: 'Broken barrier' },
  ILLEGAL_CATCH: { rule: 'Bell collar only' },
  LEG_IN_LOOP: { rule: 'No extremities in loop' },
  HEAD_NOT_THROUGH: { rule: 'Whole head must pass through loop' },
  NO_CATCH: { rule: 'No catch' },
  STRING_NOT_BROKEN: { rule: 'Run ends on the string breaking from the horn' },
  ROPE_NOT_RELEASED: { rule: 'Loop must be released from the hand' },
  EQUIPMENT_STRING: { rule: 'WPRA 12.10.9 — #18 string, minimum three knots' },
  EQUIPMENT_FLAG: { rule: 'WPRA 12.10.9 — 12x12 bright cloth' },
  ROPE_THROUGH_TACK: { rule: 'Rope may not pass through bridle, tie-down or neck rope' },
  ROPE_BEFORE_FLAG: { rule: 'May not attempt to rope before the barrier flag drops' },
  NOT_PRESENT: { rule: 'Called three times' },
} as const;

export interface BreakawayRunInput {
  rawTimeMs: number | null;
  catchType: CatchType;
  barrierBroken: boolean;
  /** Run ends when the string breaks from the horn; the flag is the signal. */
  stringBroke: boolean;
  ropeReleased: boolean;
  loopsThrown: number;
  /**
   * Whether an extremity entered the loop BEFORE the flagger dropped the flag.
   *
   * This is the edge case that bites. National Finals ground rules: if an
   * extremity gets into the loop after the flag has already dropped, the run
   * STANDS. The catch is judged at the moment of the flag, not afterwards —
   * the mirror image of team roping, where the flagger may retroactively flag
   * a team out. Callers must not set this from post-flag footage.
   */
  extremityBeforeFlag: boolean;
  equipment?: {
    stringGaugeOk: boolean;
    knotCount: number;
    flagPresent: boolean;
    flagSizeInches: number;
  };
  ropeThroughTack?: boolean;
  ropedBeforeFlag?: boolean;
  notPresent?: boolean;
  rulesProfile: RulesProfile;
}

const LEGAL_CATCH: CatchType = 'bell_collar';

export function scoreBreakawayRun(input: BreakawayRunInput): RunOutcome {
  const p = input.rulesProfile;
  const cite = (rule: string) => `${rule} (${p.edition})`;
  const penalties: AppliedPenalty[] = [];

  if (input.notPresent) {
    return {
      status: 'scratch',
      appliedPenalties: [{ code: 'NOT_PRESENT', rule: cite(BR_PENALTIES.NOT_PRESENT.rule) }],
      explanation: `Scratched — ${cite(BR_PENALTIES.NOT_PRESENT.rule)}.`,
    };
  }

  // --- Disqualifications, which outrank everything including a posted time.
  //
  // Equipment DQ deliberately happens after the run and after the time. It
  // voids a time that may already be on the board, which is why it is
  // evaluated here rather than as a pre-run gate.
  if (input.ropedBeforeFlag) {
    return dq('ROPE_BEFORE_FLAG', BR_PENALTIES.ROPE_BEFORE_FLAG.rule, cite);
  }
  if (input.ropeThroughTack) {
    return dq('ROPE_THROUGH_TACK', BR_PENALTIES.ROPE_THROUGH_TACK.rule, cite);
  }

  const equipmentRequired = profileBool(p, 'equipment_check_required', true);
  if (equipmentRequired && input.equipment) {
    const { stringGaugeOk, knotCount, flagPresent, flagSizeInches } = input.equipment;
    const minKnots = profileNumber(p, 'equipment_min_knots', 3);
    if (!stringGaugeOk || knotCount < minKnots) {
      return dq('EQUIPMENT_STRING', BR_PENALTIES.EQUIPMENT_STRING.rule, cite);
    }
    // The flag is a MINOR violation which judges may turn in — explicitly not
    // a disqualification. It is recorded and surfaced, not scored against.
    const minFlag = profileNumber(p, 'equipment_min_flag_inches', 12);
    if (!flagPresent || flagSizeInches < minFlag) {
      penalties.push({ code: 'EQUIPMENT_FLAG', rule: cite(BR_PENALTIES.EQUIPMENT_FLAG.rule) });
    }
  }

  // --- No-time conditions.
  if (input.catchType === 'no_catch' || input.rawTimeMs === null) {
    return noTime('NO_CATCH', BR_PENALTIES.NO_CATCH.rule, cite, penalties);
  }
  if (!input.ropeReleased) {
    return noTime('ROPE_NOT_RELEASED', BR_PENALTIES.ROPE_NOT_RELEASED.rule, cite, penalties);
  }
  if (!input.stringBroke) {
    return noTime('STRING_NOT_BROKEN', BR_PENALTIES.STRING_NOT_BROKEN.rule, cite, penalties);
  }
  if (input.catchType === 'leg_in_loop') {
    // Only if it happened before the flag. After the flag, the run stands.
    if (input.extremityBeforeFlag) {
      return noTime('LEG_IN_LOOP', BR_PENALTIES.LEG_IN_LOOP.rule, cite, penalties);
    }
  } else if (input.catchType !== LEGAL_CATCH) {
    const code = input.catchType === 'half_head' ? 'HEAD_NOT_THROUGH' : 'ILLEGAL_CATCH';
    const rule =
      code === 'HEAD_NOT_THROUGH'
        ? BR_PENALTIES.HEAD_NOT_THROUGH.rule
        : BR_PENALTIES.ILLEGAL_CATCH.rule;
    return noTime(code, rule, cite, penalties);
  }

  // Loop count is per class and never assumed: pro rodeo and the NFBR are
  // typically one loop, jackpots frequently allow two.
  const loopLimit = profileNumber(p, 'loops', 1);
  if (input.loopsThrown > loopLimit) {
    return noTime(
      'NO_CATCH',
      `Exceeded the ${loopLimit} loop limit for this class`,
      cite,
      penalties,
    );
  }

  // --- The one additive penalty.
  let officialTimeMs = input.rawTimeMs;
  if (input.barrierBroken) {
    // 10 seconds under PRCA/WPRA, but read from the profile — this is the
    // single most common misconfiguration in existing rodeo software.
    const barrierSeconds = requireNumber(p, 'barrier_seconds');
    officialTimeMs += barrierSeconds * 1000;
    penalties.push({
      code: 'BARRIER',
      seconds: barrierSeconds,
      rule: cite(BR_PENALTIES.BARRIER.rule),
    });
  }

  const barrierNote = input.barrierBroken
    ? ` Includes a ${formatTime(officialTimeMs - input.rawTimeMs)} second barrier penalty — ${cite(
        BR_PENALTIES.BARRIER.rule,
      )}.`
    : '';
  const flagNote = penalties.some((x) => x.code === 'EQUIPMENT_FLAG')
    ? ` Flag does not meet ${cite(BR_PENALTIES.EQUIPMENT_FLAG.rule)} — minor violation, recorded for the judge.`
    : '';

  return {
    status: input.barrierBroken ? 'penalty' : 'clean',
    officialTimeMs,
    appliedPenalties: penalties,
    explanation: `${formatTime(officialTimeMs)} on a legal bell collar catch.${barrierNote}${flagNote}`,
    provisional: true,
  };
}

function dq(code: string, rule: string, cite: (r: string) => string): RunOutcome {
  return {
    status: 'dq',
    appliedPenalties: [{ code, rule: cite(rule) }],
    explanation: `Disqualified — ${cite(rule)}.`,
  };
}

function noTime(
  code: string,
  rule: string,
  cite: (r: string) => string,
  carried: AppliedPenalty[],
): RunOutcome {
  return {
    status: 'no_time',
    appliedPenalties: [...carried, { code, rule: cite(rule) }],
    explanation: `No time — ${cite(rule)}.`,
  };
}

/**
 * Divisional (D-format) assignment, borrowed from barrel racing and
 * increasingly used at breakaway jackpots so slower ropers can win money.
 *
 * Splits are relative to the fastest time in the class, so adding one fast
 * time reshuffles every division. Always recompute the whole class — never
 * increment. This function takes the whole class for exactly that reason.
 */
export function assignDivisions(
  times: Array<{ entryId: string; officialTimeMs: number }>,
  splitsSeconds: number[],
): Array<{ entryId: string; officialTimeMs: number; division: number }> {
  if (!times.length) return [];
  const fastest = Math.min(...times.map((t) => t.officialTimeMs));
  return times.map((t) => {
    const deltaSeconds = (t.officialTimeMs - fastest) / 1000;
    let division = 1;
    for (let i = 0; i < splitsSeconds.length; i++) {
      if (deltaSeconds >= (splitsSeconds[i] as number)) division = i + 2;
    }
    return { ...t, division };
  });
}
