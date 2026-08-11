// src/lib/scoring/teamroping/index.ts
//
// Team roping. The only two-person event in the portfolio, which means
// everything singular elsewhere is a pair here: two contestants, two
// independent handicaps, two ends, and penalties attributable to each.
//
// The handicap number is the organising principle of the whole sport — a
// roper's identity is "I'm a 5.5 header" — so classification and division
// eligibility live in this file alongside the run scoring, because entering
// the wrong division costs a roper their fees at the arena.

import {
  type AppliedPenalty,
  type RulesProfile,
  type RunOutcome,
  formatTime,
  profileNumber,
  profileString,
  requireNumber,
} from '../types.ts';

export type End = 'header' | 'heeler';

export type HeadCatch =
  | 'both_horns'
  | 'half_head'
  | 'neck'
  | 'horn_hondo_cross'
  | 'crossed_loop'
  | 'bridle'
  | 'leg'
  | 'no_catch';

export type HeelCatch = 'two_feet' | 'one_foot' | 'front_foot' | 'no_catch';

export const TR_PENALTIES = {
  BARRIER: { rule: 'Broken barrier' },
  ONE_HIND_FOOT: { rule: 'One hind leg heel catch' },
  ILLEGAL_HEAD: { rule: 'Legal head catches are both horns, half head, or neck' },
  BRIDLE_CATCH: { rule: 'Rope hanging in the steer’s mouth' },
  CROSSED_LOOP: { rule: 'Loop crossing itself on a head catch' },
  HEADER_LEG: { rule: 'Header roped a leg — the header may not fish it out' },
  FRONT_FOOT: { rule: 'Front foot in the heel loop' },
  CROSSFIRE: { rule: 'Crossfire' },
  NO_DALLY: { rule: 'Both ropes must be dallied and tight' },
  NOT_FACED: { rule: 'Both horses must face the steer' },
  HEADER_TIED_ON: { rule: 'A header tying on is an automatic disqualification' },
  DALLY_OVER_TIE: { rule: 'Dallying over the top of a tied-on rope' },
  TIE_ON_INELIGIBLE: { rule: 'Heeler not eligible to tie on' },
  TIME_LIMIT: { rule: 'Exceeded the arena time limit' },
} as const;

// ---------------------------------------------------------------------------
// Classification and divisions
// ---------------------------------------------------------------------------

export interface Roper {
  id: string;
  /** Numeric with one decimal — half numbers are the industry norm since the
   *  WSTR moved to an 18-point scale in 2010. NEVER store this as an integer. */
  headerNumber: number | null;
  heelerNumber: number | null;
  /** Documented competitive advantage or disadvantage at their number. */
  elite: boolean;
  dateOfBirth: string;
  gender: 'male' | 'female' | 'unspecified';
}

export interface DivisionRule {
  /** e.g. 15 for the #15. */
  division: number;
  /** Highest individual number allowed on either end. */
  cap: number | null;
  /** Minimum required on at least one end, e.g. "#6 header OR #7 heeler". */
  floor: { headerAtLeast: number; heelerAtLeast: number } | null;
  /** Cap expressed against an Elite roper, e.g. the #10 is capped at Elite 6. */
  eliteCap: number | null;
}

export interface EligibilityResult {
  eligible: boolean;
  teamNumber: number;
  /** Every reason at once. A roper should not discover these one at a time. */
  reasons: string[];
}

/**
 * Can this pair enter this division?
 *
 * Division rules are DATA, versioned by season — USTRC publishes floors that
 * change, and hardcoding the 2026 table guarantees being wrong in 2027.
 */
export function checkDivisionEligibility(
  header: Roper,
  heeler: Roper,
  rule: DivisionRule,
): EligibilityResult {
  const reasons: string[] = [];
  const headerNumber = header.headerNumber;
  const heelerNumber = heeler.heelerNumber;

  if (headerNumber === null) reasons.push('Header has no heading classification.');
  if (heelerNumber === null) reasons.push('Heeler has no heeling classification.');
  if (headerNumber === null || heelerNumber === null) {
    return { eligible: false, teamNumber: 0, reasons };
  }

  const teamNumber = headerNumber + heelerNumber;

  if (teamNumber > rule.division) {
    reasons.push(
      `Team number is ${teamNumber}, over the #${rule.division}. ` +
        `${headerNumber} header plus ${heelerNumber} heeler.`,
    );
  }

  if (rule.cap !== null) {
    if (headerNumber > rule.cap) {
      reasons.push(`Header is a ${headerNumber}, over the #${rule.division} cap of ${rule.cap}.`);
    }
    if (heelerNumber > rule.cap) {
      reasons.push(`Heeler is a ${heelerNumber}, over the #${rule.division} cap of ${rule.cap}.`);
    }
  }

  // Two Elite ropers cannot enter the same division together — they go up one.
  if (header.elite && heeler.elite) {
    reasons.push(
      `Both ropers are Elite, so this pair must go up a division to the #${rule.division + 1}.`,
    );
  }

  if (rule.eliteCap !== null) {
    if (header.elite && headerNumber > rule.eliteCap) {
      reasons.push(`The #${rule.division} is capped at Elite ${rule.eliteCap}.`);
    }
    if (heeler.elite && heelerNumber > rule.eliteCap) {
      reasons.push(`The #${rule.division} is capped at Elite ${rule.eliteCap}.`);
    }
  }

  // Higher divisions require a minimum on at least one end so two low numbers
  // cannot stack into a division meant for stronger ropers.
  if (rule.floor) {
    const meetsFloor =
      headerNumber >= rule.floor.headerAtLeast || heelerNumber >= rule.floor.heelerAtLeast;
    if (!meetsFloor) {
      reasons.push(
        `The #${rule.division} needs at least a #${rule.floor.headerAtLeast} header ` +
          `or a #${rule.floor.heelerAtLeast} heeler.`,
      );
    }
  }

  return { eligible: reasons.length === 0, teamNumber, reasons };
}

/**
 * May this heeler tie on?
 *
 * Never applies to headers — a header tying on is an automatic
 * disqualification, full stop, and that is checked in the run scorer.
 *
 * The female rule is the one age rule in the book that is DAY based rather
 * than year-of-birth based: eligibility starts on the 13th birthday itself.
 * Everything else here keys off year of birth.
 */
export function checkTieOnEligibility(
  heeler: Roper,
  onDate: Date,
): { eligible: boolean; reason: string } {
  const dob = new Date(heeler.dateOfBirth);
  const yearAge = onDate.getUTCFullYear() - dob.getUTCFullYear();
  const number = heeler.heelerNumber ?? 0;

  if (heeler.gender === 'female') {
    const thirteenth = new Date(dob);
    thirteenth.setUTCFullYear(dob.getUTCFullYear() + 13);
    if (onDate >= thirteenth) {
      return { eligible: true, reason: 'Female heeler, 13 or older.' };
    }
    return { eligible: false, reason: 'No one 12 or under may tie on, ever.' };
  }

  if (heeler.gender === 'male') {
    if (yearAge >= 60) return { eligible: true, reason: 'Male heeler 60 or older.' };
    if (yearAge >= 55 && number <= 5.5) {
      return { eligible: true, reason: 'Male heeler 55 or older classified 5.5 or below.' };
    }
    return {
      eligible: false,
      reason:
        'Male heelers may tie on at 60, or at 55 with a classification of 5.5 or below. ' +
        'Medical exemptions are granted case by case by Global Handicaps.',
    };
  }

  return { eligible: false, reason: 'Tie-on eligibility could not be determined.' };
}

// ---------------------------------------------------------------------------
// Run scoring
// ---------------------------------------------------------------------------

export interface TeamRopingRunInput {
  rawTimeMs: number | null;
  headCatch: HeadCatch;
  heelCatch: HeelCatch;
  /** Whether the front foot came free before the team called for time. */
  frontFootFreedBeforeTime: boolean;
  barrierBroken: boolean;
  /**
   * Crossfire is judged differently by association and it is one of the most
   * argued calls in the sport. USTRC calls it on the heel loop RELEASE, PRCA
   * on when the loop makes CONTACT — a heeler may release before the turn
   * completes as long as contact happens after. Callers supply both frames
   * and the profile decides which one is judged.
   */
  heelLoopReleasedBeforeTow: boolean;
  heelLoopContactBeforeTow: boolean;
  bothDallied: boolean;
  bothFaced: boolean;
  bothMounted: boolean;
  steerStanding: boolean;
  headerTiedOn: boolean;
  heelerTiedOn: boolean;
  heelerTieOnEligible: boolean;
  dalliedOverTiedRope?: boolean;
  rulesProfile: RulesProfile;
}

const LEGAL_HEAD: HeadCatch[] = ['both_horns', 'half_head', 'neck'];

export function scoreTeamRopingRun(input: TeamRopingRunInput): RunOutcome {
  const p = input.rulesProfile;
  const cite = (rule: string) => `${rule} (${p.edition})`;
  const penalties: AppliedPenalty[] = [];

  if (input.headerTiedOn) {
    return fail('dq', 'HEADER_TIED_ON', TR_PENALTIES.HEADER_TIED_ON.rule, cite, penalties);
  }
  if (input.dalliedOverTiedRope) {
    return fail('dq', 'DALLY_OVER_TIE', TR_PENALTIES.DALLY_OVER_TIE.rule, cite, penalties);
  }
  if (input.heelerTiedOn && !input.heelerTieOnEligible) {
    return fail('dq', 'TIE_ON_INELIGIBLE', TR_PENALTIES.TIE_ON_INELIGIBLE.rule, cite, penalties);
  }

  if (input.headCatch === 'leg') {
    return fail('no_time', 'HEADER_LEG', TR_PENALTIES.HEADER_LEG.rule, cite, penalties);
  }
  if (input.headCatch === 'bridle') {
    return fail('no_time', 'BRIDLE_CATCH', TR_PENALTIES.BRIDLE_CATCH.rule, cite, penalties);
  }
  if (input.headCatch === 'crossed_loop') {
    return fail('no_time', 'CROSSED_LOOP', TR_PENALTIES.CROSSED_LOOP.rule, cite, penalties);
  }
  if (!LEGAL_HEAD.includes(input.headCatch)) {
    return fail('no_time', 'ILLEGAL_HEAD', TR_PENALTIES.ILLEGAL_HEAD.rule, cite, penalties);
  }

  // Crossfire, judged under whichever standard the class is running.
  const standard = profileString<'loop_release' | 'loop_contact'>(
    p,
    'crossfire_standard',
    'loop_release',
  );
  const crossfired =
    standard === 'loop_contact'
      ? input.heelLoopContactBeforeTow
      : input.heelLoopReleasedBeforeTow;
  if (crossfired) {
    return fail(
      'no_time',
      'CROSSFIRE',
      `${TR_PENALTIES.CROSSFIRE.rule}, judged on ${
        standard === 'loop_contact' ? 'loop contact' : 'loop release'
      }`,
      cite,
      penalties,
    );
  }

  if (input.heelCatch === 'no_catch' || input.rawTimeMs === null) {
    return fail('no_time', 'ILLEGAL_HEAD', 'No heel catch', cite, penalties);
  }
  // A front foot is a foul catch — but if it comes free before the team calls
  // for time, the time counts. The flagger will not allow extra time for it.
  if (input.heelCatch === 'front_foot' && !input.frontFootFreedBeforeTime) {
    return fail('no_time', 'FRONT_FOOT', TR_PENALTIES.FRONT_FOOT.rule, cite, penalties);
  }

  if (!input.bothDallied) {
    return fail('no_time', 'NO_DALLY', TR_PENALTIES.NO_DALLY.rule, cite, penalties);
  }
  if (!input.bothMounted || !input.steerStanding) {
    return fail('no_time', 'NO_DALLY', 'Both ropers mounted, steer standing when roped', cite, penalties);
  }

  // Facing is not required in flag-on-the-heels classes.
  const finishMode = profileString<'face' | 'heel_flag'>(p, 'finish_mode', 'face');
  if (finishMode === 'face' && !input.bothFaced) {
    return fail('no_time', 'NOT_FACED', TR_PENALTIES.NOT_FACED.rule, cite, penalties);
  }

  let officialTimeMs = input.rawTimeMs;

  if (input.barrierBroken) {
    // USTRC is 5 seconds, PRCA is 10. This is the single most common
    // misconfiguration in existing rodeo software, so it is required rather
    // than defaulted — a wrong barrier misprices every run in the class.
    const barrierSeconds = requireNumber(p, 'barrier_seconds');
    officialTimeMs += barrierSeconds * 1000;
    penalties.push({
      code: 'BARRIER',
      seconds: barrierSeconds,
      rule: cite(TR_PENALTIES.BARRIER.rule),
    });
  }

  if (input.heelCatch === 'one_foot') {
    const seconds = profileNumber(p, 'one_hind_foot_seconds', 5);
    officialTimeMs += seconds * 1000;
    penalties.push({
      code: 'ONE_HIND_FOOT',
      seconds,
      rule: cite(TR_PENALTIES.ONE_HIND_FOOT.rule),
    });
  }

  const added = penalties
    .filter((x) => typeof x.seconds === 'number')
    .map((x) => `${x.seconds} second ${x.code === 'BARRIER' ? 'barrier' : 'one hind foot'}`)
    .join(' and ');
  const note = added ? ` Includes a ${added} penalty.` : '';

  return {
    status: penalties.some((x) => x.seconds) ? 'penalty' : 'clean',
    officialTimeMs,
    appliedPenalties: penalties,
    explanation: `${formatTime(officialTimeMs)}.${note}`,
    // The flagger may retroactively flag a team out after a time is taken,
    // for an illegal catch or an insecure steer not visible at the flag. The
    // run stays reversible until the round is finalised.
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

/**
 * Par delta — the metric Global Handicaps 2.0 actually moves a number on.
 *
 * Wins at or slower than the national par time for the division do not push a
 * number up; too fast is too fast regardless of the size or age bracket of
 * the roping. Negative means faster than par.
 *
 * Present this as observation, never as advice. Framing it as "how to stay
 * under a number" is precisely what the association penalises, and
 * misrepresenting a number is a major offence carrying an upward adjustment
 * of not less than one year.
 */
export function parDelta(officialTimeMs: number, parTimeMs: number): number {
  return (officialTimeMs - parTimeMs) / 1000;
}
