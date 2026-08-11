// src/lib/scoring/bareback/index.ts
//
// Bareback riding. Shares the scoring core in ../roughstock.ts.
//
// What makes this app different from saddle bronc is the rigging: the
// specification is precise, enforceable at the chute, and failing inspection
// is a disqualification that in some associations carries a fine and an
// ineligibility period on top. checkRiggingSpec() below is meant to be run
// BEFORE the rider nods, not after.

import type { JudgeScore, RulesProfile, RunOutcome } from '../types.ts';
import { scoreRoughstockRide } from '../roughstock.ts';

export const BB_OUTCOMES = {
  QUALIFIED: { rule: 'Qualified ride' },
  BUCKED_OFF: { rule: 'Did not reach eight seconds' },
  MISSED_OUT: { rule: 'Failed to mark out' },
  FREE_ARM_TOUCH: { rule: 'Free arm touched the horse or the rider' },
  HAND_OUT: { rule: 'Lost the rigging' },
  EQUIPMENT_VIOLATION: { rule: 'Rigging or rowel specification' },
  TURNOUT: { rule: 'Turned out' },
} as const;

export interface RiggingSpec {
  /** Continuous solid handhold, not exceeding 8 inches in length. */
  handholdLengthInches: number;
  /** Handhold covered by at least 3 inches of securely fastened suede. */
  suedeCoverInches: number;
  /** Maximum 10 inches at the handhold. */
  widthAtHandholdInches: number;
  /** Maximum 6 inches at the D-ring. */
  widthAtDRingInches: number;
  /** No fibreglass or metal in the handhold itself. */
  handholdMaterialLegal: boolean;
  /** Non-metallic cinch strap of mohair or hemp. */
  cinchMaterial: 'mohair' | 'hemp' | 'other';
  /** D-rings only for hardware. */
  hardwareIsDRingsOnly: boolean;
}

export interface RiggingCheck {
  passes: boolean;
  /** Every failure at once — a rider at the chute needs the whole list. */
  failures: string[];
}

/**
 * Check a rigging against the specification.
 *
 * Run this at the equipment check, not at scoring time. The whole point is
 * that a rider finds out in the alley rather than after an eighty-point ride
 * gets thrown out.
 */
export function checkRiggingSpec(spec: RiggingSpec): RiggingCheck {
  const failures: string[] = [];

  if (spec.handholdLengthInches > 8) {
    failures.push(
      `Handhold is ${spec.handholdLengthInches}", over the 8" maximum.`,
    );
  }
  if (spec.suedeCoverInches < 3) {
    failures.push(
      `Suede cover is ${spec.suedeCoverInches}", under the 3" minimum.`,
    );
  }
  if (spec.widthAtHandholdInches > 10) {
    failures.push(
      `Width at the handhold is ${spec.widthAtHandholdInches}", over the 10" maximum.`,
    );
  }
  if (spec.widthAtDRingInches > 6) {
    failures.push(
      `Width at the D-ring is ${spec.widthAtDRingInches}", over the 6" maximum.`,
    );
  }
  if (!spec.handholdMaterialLegal) {
    failures.push('No fibreglass or metal is permitted in the handhold itself.');
  }
  if (spec.cinchMaterial === 'other') {
    failures.push('Cinch strap must be non-metallic, mohair or hemp.');
  }
  if (!spec.hardwareIsDRingsOnly) {
    failures.push('D-rings are the only permitted hardware.');
  }

  return { passes: failures.length === 0, failures };
}

export interface BarebackRideInput {
  qualifiedRide: boolean;
  markedOut: boolean;
  judgeScores: JudgeScore[];
  freeArmTouched: boolean;
  /** Lost the rigging before the whistle. */
  handOut: boolean;
  rigging?: RiggingSpec;
  /** Rowels must be free spinning, dull and humane. */
  rowelsLegal?: boolean;
  reride?: { offered: boolean; accepted: boolean | null };
  turnedOut?: boolean;
  rulesProfile: RulesProfile;
}

export function scoreBarebackRide(input: BarebackRideInput): RunOutcome {
  const disqualifications: Array<{ code: string; rule: string }> = [];

  if (input.rigging) {
    const check = checkRiggingSpec(input.rigging);
    if (!check.passes) {
      disqualifications.push({
        code: 'EQUIPMENT_VIOLATION',
        rule: `${BB_OUTCOMES.EQUIPMENT_VIOLATION.rule} — ${check.failures[0]}`,
      });
    }
  }
  if (input.rowelsLegal === false) {
    disqualifications.push({
      code: 'EQUIPMENT_VIOLATION',
      rule: 'Rowels must be free spinning, dull and humane',
    });
  }
  if (input.freeArmTouched) {
    disqualifications.push({ code: 'FREE_ARM_TOUCH', rule: BB_OUTCOMES.FREE_ARM_TOUCH.rule });
  }
  if (input.handOut) {
    disqualifications.push({ code: 'HAND_OUT', rule: BB_OUTCOMES.HAND_OUT.rule });
  }

  return scoreRoughstockRide({
    qualifiedRide: input.qualifiedRide,
    markedOut: input.markedOut,
    judgeScores: input.judgeScores,
    disqualifications,
    reride: input.reride,
    turnedOut: input.turnedOut,
    rulesProfile: input.rulesProfile,
  });
}
