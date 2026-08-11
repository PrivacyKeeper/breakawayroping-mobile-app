// src/lib/scoring/saddlebronc/index.ts
//
// Saddle bronc. Rodeo's classic event and the most technical of the
// roughstock events. Shares the scoring core in ../roughstock.ts; everything
// here is what saddle bronc has that bareback does not.

import type { JudgeScore, RulesProfile, RunOutcome } from '../types.ts';
import { scoreRoughstockRide } from '../roughstock.ts';

export const SB_OUTCOMES = {
  QUALIFIED: { rule: 'Qualified ride' },
  BUCKED_OFF: { rule: 'Did not reach eight seconds' },
  MISSED_OUT: { rule: 'Failed to mark out' },
  FREE_HAND_TOUCH: { rule: 'Free hand touched the horse, saddle, rein or the rider' },
  LOST_STIRRUP: { rule: 'Both feet must stay in the stirrups' },
  LOST_REIN: { rule: 'Lost the rein' },
  EQUIPMENT_VIOLATION: { rule: 'Saddle rigging, halter or rowel specification' },
  TURNOUT: { rule: 'Turned out' },
} as const;

export interface SaddleBroncRideInput {
  qualifiedRide: boolean;
  markedOut: boolean;
  judgeScores: JudgeScore[];
  freeHandTouched: boolean;
  lostStirrup: boolean;
  lostRein: boolean;
  equipment?: {
    /** Three-quarter double, D-ring not further back than below the swell. */
    riggingLegal: boolean;
    /** Regulation halter with a single rein. */
    halterLegal: boolean;
    /** Rowels must be free spinning, dull and humane. */
    rowelsLegal: boolean;
  };
  reride?: { offered: boolean; accepted: boolean | null };
  turnedOut?: boolean;
  rulesProfile: RulesProfile;
}

export function scoreSaddleBroncRide(input: SaddleBroncRideInput): RunOutcome {
  const disqualifications: Array<{ code: string; rule: string }> = [];

  // The chute judge may inspect before the ride and disqualify for
  // noncompliance, so equipment is evaluated ahead of the ride itself.
  if (input.equipment) {
    const { riggingLegal, halterLegal, rowelsLegal } = input.equipment;
    if (!riggingLegal || !halterLegal || !rowelsLegal) {
      disqualifications.push({
        code: 'EQUIPMENT_VIOLATION',
        rule: SB_OUTCOMES.EQUIPMENT_VIOLATION.rule,
      });
    }
  }
  if (input.freeHandTouched) {
    disqualifications.push({
      code: 'FREE_HAND_TOUCH',
      rule: SB_OUTCOMES.FREE_HAND_TOUCH.rule,
    });
  }
  if (input.lostStirrup) {
    disqualifications.push({ code: 'LOST_STIRRUP', rule: SB_OUTCOMES.LOST_STIRRUP.rule });
  }
  if (input.lostRein) {
    disqualifications.push({ code: 'LOST_REIN', rule: SB_OUTCOMES.LOST_REIN.rule });
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
