// src/lib/scoring/types.ts
//
// The interface every RodeoApps rule engine implements. Same shape in all
// seven apps, completely different internals — per the shared spine, do not
// write one generic scoring function and try to make it fit every event.
//
// Two properties this file exists to enforce:
//
// EVERY RULE IS DATA. Penalty seconds, catch legality, loop counts, time
// limits and the association variations all arrive in a RulesProfile bound to
// a dated rule set. Rodeo rules change annually and mid-season — the WPRA
// amends continuously — so anything hardcoded here is wrong by October.
//
// EVERY OUTCOME CITES ITS RULE. Contestants argue calls, and they are
// entitled to. "10 second barrier, PRCA 2026 Rule Book" is defensible; a bare
// number is not.

export type RunStatus =
  | 'clean'
  | 'penalty'
  | 'no_time'
  | 'no_score'
  | 'dq'
  | 'turned_out'
  | 'scratch'
  | 'rerun'
  | 'reride_pending';

export interface AppliedPenalty {
  code: string;
  seconds?: number;
  points?: number;
  /** Human-readable citation. Shown to the contestant, verbatim. */
  rule: string;
}

export interface JudgeScore {
  judgeId: string;
  /** 0-25 in every roughstock event in this portfolio. */
  rider: number;
  /** 0-25. Half the score belongs to an animal the contestant does not own. */
  animal: number;
}

/**
 * Association-specific configuration, resolved from a dated rule set at
 * WRITE time and stored with the run — never resolved by "current" at read
 * time. A run must be scored under the rules in force on the day it happened,
 * forever: recomputing a 2026 average with 2027 rules produces wrong history,
 * wrong standings and wrong money.
 */
export interface RulesProfile {
  /** Identifier of the rule set this came from, stored on the run. */
  ruleSetId: string;
  /** e.g. "PRCA 2026 Rule Book" — used in every citation. */
  edition: string;
  associationCode: string;
  /** Open bag of rule_key -> value. See each engine for the keys it reads. */
  values: Record<string, unknown>;
}

export interface RunOutcome {
  status: RunStatus;
  /** Timed events. Milliseconds. Absent on a no-time. */
  officialTimeMs?: number;
  /** Judged events. 0-100. Absent on a no-score. */
  officialScore?: number;
  appliedPenalties: AppliedPenalty[];
  /** Plain-language, cites the rule. Shown to the contestant. */
  explanation: string;
  /** True when an official may still overturn this before the round closes. */
  provisional?: boolean;
}

// ---------------------------------------------------------------------------
// Profile helpers
// ---------------------------------------------------------------------------

/**
 * Read a value from the profile with a documented default.
 *
 * The default is a fallback for a profile that predates a key being added,
 * NOT a place to encode a rule. If a value materially changes the outcome it
 * belongs in the rule set, and `requireNumber` should be used instead so a
 * missing value fails loudly rather than scoring somebody under a guess.
 */
export function profileNumber(
  profile: RulesProfile,
  key: string,
  fallback: number,
): number {
  const value = profile.values[key];
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

export function profileBool(
  profile: RulesProfile,
  key: string,
  fallback: boolean,
): boolean {
  const value = profile.values[key];
  return typeof value === 'boolean' ? value : fallback;
}

export function profileString<T extends string>(
  profile: RulesProfile,
  key: string,
  fallback: T,
): T {
  const value = profile.values[key];
  return typeof value === 'string' ? (value as T) : fallback;
}

/**
 * For values where guessing is worse than failing — the barrier penalty being
 * the obvious one, since USTRC is 5 seconds and PRCA is 10 and getting it
 * wrong silently misprices every run in the class.
 */
export function requireNumber(profile: RulesProfile, key: string): number {
  const value = profile.values[key];
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(
      `Rules profile "${profile.edition}" is missing required numeric rule "${key}". ` +
        'Refusing to score rather than guess.',
    );
  }
  return value;
}

/** Formats milliseconds the way a rodeo posts a time: 13.42, not 13.417. */
export function formatTime(ms: number): string {
  return (Math.round(ms / 10) / 100).toFixed(2);
}
