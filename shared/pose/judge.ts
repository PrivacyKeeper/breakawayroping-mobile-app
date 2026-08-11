// src/lib/pose/judge.ts
//
// Turning measurements into coded faults, and coded faults into what a coach
// needs to fix.
//
// Measuring and judging are separate on purpose. The measurement is what
// happened; the fault is what we think about it. Thresholds will move as
// there is data to fit them against, and moving them must not require
// recomputing every historical measurement.
//
// WHY THE CODES MATTER. A coach report counts how many riders on a team share
// a fault, and that count is only meaningful if the fault is named
// identically every time. Ask a model to describe a run and the same fault
// comes back three different ways across three riders, tallying as three
// separate one-rider problems — which is exactly the pattern the coach needed
// to see. So faults are emitted here, from numbers, against a fixed list.
//
// Codes are permanent once shipped. Reword a label freely; never change what
// a code means. Retire it and add a new one, and bump the taxonomy version.

import type {
  DetectedFault,
  FaultDefinition,
  FaultSeverity,
  RunFeatures,
} from './types.ts';

export interface Taxonomy {
  version: string;
  definitions: FaultDefinition[];
  /**
   * Segments a per-segment fault is evaluated against. Breakaway has one
   * throw; barrel racing has three turns; ranch rodeo has a card of events.
   * A definition whose segment is 'whole_run' is evaluated once regardless.
   */
  repeatedSegments?: string[];
}

export interface JudgeOptions {
  /** Skip animal-attributed faults when no animal baseline was available. */
  includeAnimalFaults: boolean;
  measurementConfidence: number;
}

export function judgeRun(
  taxonomy: Taxonomy,
  features: RunFeatures,
  options: JudgeOptions,
): DetectedFault[] {
  const detected: DetectedFault[] = [];
  const repeated = taxonomy.repeatedSegments ?? [];

  for (const definition of taxonomy.definitions) {
    if (!options.includeAnimalFaults && definition.attributedTo === 'horse') continue;

    if (definition.segment === 'whole_run' || repeated.length === 0) {
      const fault = evaluate(
        taxonomy.version,
        definition,
        features,
        definition.feature,
        definition.segment,
        features[`${definition.feature}_t_ms`] ?? null,
        options,
      );
      if (fault) detected.push(fault);
      continue;
    }

    for (const segment of repeated) {
      const key = `${segment}_${definition.feature}`;
      const fault = evaluate(
        taxonomy.version,
        definition,
        features,
        key,
        segment,
        features[`${segment}_t_ms`] ?? null,
        options,
      );
      if (fault) detected.push(fault);
    }
  }

  const rank: Record<FaultSeverity, number> = { high: 3, medium: 2, low: 1 };
  detected.sort(
    (a, b) => rank[b.severity] - rank[a.severity] || Math.abs(b.deviation) - Math.abs(a.deviation),
  );
  return detected;
}

function evaluate(
  version: string,
  definition: FaultDefinition,
  features: RunFeatures,
  featureKey: string,
  segment: string,
  tMs: number | null,
  options: JudgeOptions,
): DetectedFault | null {
  const measured = features[featureKey];
  if (measured === undefined || !Number.isFinite(measured)) return null;

  // Features carry the direction of the error in their sign, so an inverted
  // definition (not enough of something) just flips it.
  const value = definition.inverted ? -measured : measured;
  const severity = severityFor(value, definition.thresholds);
  if (!severity) return null;

  const baseline = features[`${featureKey}_baseline`];

  return {
    code: definition.code,
    taxonomyVersion: version,
    segment,
    attributedTo: definition.attributedTo,
    severity,
    measuredValue: measured,
    baselineValue: baseline !== undefined ? baseline : null,
    deviation: value,
    tMs: tMs !== null && Number.isFinite(tMs) ? tMs : null,
    confidence: Math.max(0, Math.min(1, options.measurementConfidence)),
  };
}

function severityFor(
  value: number,
  thresholds: FaultDefinition['thresholds'],
): FaultSeverity | null {
  if (value >= thresholds.high) return 'high';
  if (value >= thresholds.medium) return 'medium';
  if (value >= thresholds.low) return 'low';
  return null;
}

// ---------------------------------------------------------------------------
// Coach aggregation
// ---------------------------------------------------------------------------

export interface FaultTally {
  code: string;
  label: string;
  description: string;
  attributedTo: 'rider' | 'horse' | 'pair';
  /** Distinct contestants showing this fault. The number a coach acts on. */
  riderCount: number;
  riderIds: string[];
  /** Total occurrences, which can exceed riderCount across repeated segments. */
  occurrences: number;
  prevalence: number;
  worstSeverity: FaultSeverity;
  medianDeviation: number;
  drill: string;
}

/**
 * Roll individual runs up into the coach's view.
 *
 * Deterministic and done here rather than by a model. A model is good at
 * writing the paragraph a coach reads and bad at counting, so it gets the
 * counts as input and the counts are already true.
 */
export function tallyFaults(
  taxonomy: Taxonomy,
  runs: Array<{ riderId: string; faults: DetectedFault[] }>,
  options: { minimumPrevalence?: number } = {},
): FaultTally[] {
  const rosterSize = new Set(runs.map((r) => r.riderId)).size;
  if (!rosterSize) return [];

  const byCode = new Map<string, {
    riders: Set<string>;
    occurrences: number;
    severities: FaultSeverity[];
    deviations: number[];
  }>();

  for (const run of runs) {
    for (const fault of run.faults) {
      let entry = byCode.get(fault.code);
      if (!entry) {
        entry = { riders: new Set(), occurrences: 0, severities: [], deviations: [] };
        byCode.set(fault.code, entry);
      }
      entry.riders.add(run.riderId);
      entry.occurrences += 1;
      entry.severities.push(fault.severity);
      entry.deviations.push(fault.deviation);
    }
  }

  const definitions = new Map(taxonomy.definitions.map((d) => [d.code, d]));
  const rank: Record<FaultSeverity, number> = { high: 3, medium: 2, low: 1 };
  const minimum = options.minimumPrevalence ?? 0;
  const tallies: FaultTally[] = [];

  for (const [code, entry] of byCode) {
    const definition = definitions.get(code);
    if (!definition) continue;

    const prevalence = entry.riders.size / rosterSize;
    if (prevalence < minimum) continue;

    tallies.push({
      code,
      label: definition.label,
      description: definition.description,
      attributedTo: definition.attributedTo,
      riderCount: entry.riders.size,
      riderIds: [...entry.riders],
      occurrences: entry.occurrences,
      prevalence,
      worstSeverity: entry.severities.reduce<FaultSeverity>(
        (worst, s) => (rank[s] > rank[worst] ? s : worst),
        'low',
      ),
      medianDeviation: median(entry.deviations),
      drill: definition.drill,
    });
  }

  // Ranked by how many contestants share it. A fault half the roster makes is
  // a coaching problem; a fault one person makes is theirs to work on.
  tallies.sort(
    (a, b) => b.riderCount - a.riderCount || rank[b.worstSeverity] - rank[a.worstSeverity],
  );
  return tallies;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? (sorted[mid] as number) : ((sorted[mid - 1] as number) + (sorted[mid] as number)) / 2;
}
