// src/lib/rules.ts
//
// The run-ending rules, as data the app can render.
//
// This is a one-line adapter and it exists for a reason worth stating: the
// rules screen must not be a second copy of the rulebook. It reads the SAME
// table the scoring engine applies, so the app cannot tell somebody one thing
// and score them by another. Add a penalty to the engine and it appears here;
// there is nowhere to forget.
//
// Every app's table is named for its event (BR_PENALTIES), which is why this file
// is per-app and the screen that reads it is not.

import { BR_PENALTIES } from './scoring/index.ts';

export type RunEndingRule = {
  rule: string;
  /** Seconds added, where the table fixes the amount. */
  seconds?: number;
  /** 'no_time' or 'dq', where the outcome is not a time penalty. */
  status?: string;
};

export const RUN_ENDING_RULES: Record<string, RunEndingRule> = BR_PENALTIES;

export const RULES_HEADING = 'What ends your run';
export const RULES_INTRO =
  'Every way a breakaway run is stopped, no-timed or disqualified, straight out of the rule engine this app scores with.';
