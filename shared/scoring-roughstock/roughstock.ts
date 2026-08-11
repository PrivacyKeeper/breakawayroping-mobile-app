// src/lib/scoring/roughstock.ts
//
// Scoring core shared by saddle bronc and bareback.
//
// The bareback build map is explicit: "Shares the roughstock scoring engine
// with saddlebronc.pro but the equipment rules, the analysis targets, and the
// health module are materially different. Do not fork the saddle bronc
// codebase and rename it."
//
// So the genuinely common part — eight seconds, two judges, 25 + 25, the
// mark-out variation, rerides — lives here once, and each event supplies its
// own disqualification codes and equipment rules on top. That is deliberate
// sharing. Copying this file and editing it would be the forking the map
// warns against.

import {
  type JudgeScore,
  type RulesProfile,
  type RunOutcome,
  profileNumber,
  profileString,
} from './types.ts';

/** How a missed mark-out is treated. Two associations, two outcomes. */
export type MarkOutTreatment = 'disqualify' | 'scored';

export interface RoughstockInput {
  /** Did the rider make the whistle? */
  qualifiedRide: boolean;
  /**
   * Both spurs touching above the point of the shoulders, held until the
   * horse's front feet hit the ground after the first jump. Both must
   * qualify simultaneously.
   */
  markedOut: boolean;
  judgeScores: JudgeScore[];
  /** Event-specific disqualifications, already evaluated by the caller. */
  disqualifications: Array<{ code: string; rule: string }>;
  reride?: {
    offered: boolean;
    /** Recorded because a rider may keep the score he has instead. */
    accepted: boolean | null;
  };
  turnedOut?: boolean;
  rulesProfile: RulesProfile;
}

export function scoreRoughstockRide(input: RoughstockInput): RunOutcome {
  const p = input.rulesProfile;
  const cite = (rule: string) => `${rule} (${p.edition})`;

  if (input.turnedOut) {
    return {
      status: 'turned_out',
      appliedPenalties: [{ code: 'TURNOUT', rule: cite('Turned out') }],
      explanation: `Turned out — ${cite('Turned out')}. May carry a fine.`,
    };
  }

  // Event-specific disqualifications outrank everything.
  const firstDq = input.disqualifications[0];
  if (firstDq) {
    return {
      status: 'no_score',
      appliedPenalties: input.disqualifications.map((d) => ({
        code: d.code,
        rule: cite(d.rule),
      })),
      explanation: `No score — ${cite(firstDq.rule)}.`,
    };
  }

  if (!input.qualifiedRide) {
    return {
      status: 'no_score',
      appliedPenalties: [{ code: 'BUCKED_OFF', rule: cite('Did not reach eight seconds') }],
      explanation: `No score — ${cite('Did not reach eight seconds')}.`,
    };
  }

  // The mark-out variation. PRCA treats a miss as an automatic
  // disqualification. IPRA changed this in 2024: foot position at the moment
  // the front feet touch down is folded into the judges' 25 points instead,
  // with no automatic no score. Same physical event, opposite outcome —
  // exactly the sort of thing generic rodeo software gets wrong.
  const markOut = profileString<MarkOutTreatment>(p, 'mark_out_treatment', 'disqualify');
  if (!input.markedOut && markOut === 'disqualify') {
    return {
      status: 'no_score',
      appliedPenalties: [{ code: 'MISSED_OUT', rule: cite('Failed to mark out') }],
      explanation: `No score — ${cite('Failed to mark out')}.`,
    };
  }

  const judgeCount = profileNumber(p, 'judge_count', 2);
  if (input.judgeScores.length !== judgeCount) {
    throw new Error(
      `Expected ${judgeCount} judge scores under ${p.edition}, got ${input.judgeScores.length}. ` +
        'Refusing to score a partial card.',
    );
  }

  const maxPerComponent = profileNumber(p, 'judge_component_max', 25);
  for (const judge of input.judgeScores) {
    assertInRange(judge.rider, maxPerComponent, `judge ${judge.judgeId} rider`);
    assertInRange(judge.animal, maxPerComponent, `judge ${judge.judgeId} animal`);
  }

  const officialScore = input.judgeScores.reduce((sum, j) => sum + j.rider + j.animal, 0);

  if (input.reride?.offered && input.reride.accepted === null) {
    return {
      status: 'reride_pending',
      officialScore,
      appliedPenalties: [],
      explanation:
        `${officialScore} marked, reride offered. The rider may keep this score or take the reride; ` +
        'the reride must be taken by the rider it was offered to.',
      provisional: true,
    };
  }

  const markOutNote =
    !input.markedOut && markOut === 'scored'
      ? ' Mark-out was missed and folded into the judges’ marks rather than disqualifying, per this association.'
      : '';

  return {
    status: 'clean',
    officialScore,
    appliedPenalties: [],
    explanation: `${officialScore} points — ${describeCard(input.judgeScores)}.${markOutNote}`,
    provisional: true,
  };
}

function assertInRange(value: number, max: number, label: string): void {
  if (!Number.isFinite(value) || value < 0 || value > max) {
    throw new Error(`${label} score ${value} is outside 0-${max}.`);
  }
}

/**
 * Judge splits are analytically interesting and are needed to reconstruct a
 * protest, which is why the four component numbers are always stored rather
 * than just the total.
 */
function describeCard(scores: JudgeScore[]): string {
  return scores
    .map((j) => `${j.rider} rider / ${j.animal} horse`)
    .join(', ');
}

/** Sum of just the animal marks. Half the score belongs to the stock. */
export function animalPoints(scores: JudgeScore[]): number {
  return scores.reduce((sum, j) => sum + j.animal, 0);
}

export function riderPoints(scores: JudgeScore[]): number {
  return scores.reduce((sum, j) => sum + j.rider, 0);
}
