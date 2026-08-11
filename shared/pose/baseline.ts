// src/lib/pose/baseline.ts
//
// Turn a finished walk-around capture into the two baselines it produces.
//
// One capture, two artifacts, deliberately separable:
//
//   - the RIDER baseline is hers and follows her between horses
//   - the HORSE baseline belongs to the horse and follows it between riders,
//     between owners, and between RodeoApps products
//
// She films once per horse. A rider with three horses ends up with three
// horse baselines and one rider baseline confirmed three times over, and the
// agreement between those three confirmations is free evidence about whether
// any of the captures was bad.

import type {
  HorseBaseline,
  HorseFrame,
  HorseGaitMetrics,
  PoseFrame,
  RiderBaseline,
  RiderMeasurements,
} from './types.ts';
import {
  POSE,
  angleAt,
  angleFromHorizontal,
  angleFromVertical,
  averageVisibility,
  clamp,
  distance,
  lowerBodyVisible,
  mean,
  midpoint,
  standardDeviation,
  torsoLength,
} from './landmarks.ts';
import { computeEmbedding, mergeEmbeddings } from './embedding.ts';
import { extractLandmarkSeeds, measureHorseConformation } from './horse.ts';
import { HORSE } from './landmarks.ts';

export interface BuildBaselineInput {
  userId: string;
  horseId?: string;
  riderFrames: PoseFrame[];
  horseFrames: HorseFrame[];
  coverageDegrees: number;
  captureQuality: number;
  /** Previous baseline to fold this capture into, if she has one. */
  existingRiderBaseline?: RiderBaseline | null;
}

export interface BuildBaselineResult {
  rider: RiderBaseline | null;
  horse: HorseBaseline | null;
  warnings: string[];
}

export function buildBaselines(input: BuildBaselineInput): BuildBaselineResult {
  const warnings: string[] = [];

  const rider = buildRiderBaseline(input, warnings);
  const horse = input.horseId
    ? buildHorseBaseline(input.horseId, input.userId, input.horseFrames, input.captureQuality, warnings)
    : null;

  if (!horse && input.horseId) {
    warnings.push('Could not measure the horse from this capture — rider analysis only.');
  }

  return { rider, horse, warnings };
}

// ---------------------------------------------------------------------------
// Rider
// ---------------------------------------------------------------------------

function buildRiderBaseline(
  input: BuildBaselineInput,
  warnings: string[],
): RiderBaseline | null {
  const usable = input.riderFrames.filter(
    (f) => f.landmarks.length >= 33 && averageVisibility(f.landmarks) > 0.35,
  );
  if (usable.length < 6) {
    warnings.push('Not enough clear frames of the rider to build a baseline.');
    return null;
  }

  const embeddings = usable
    .map((f) => computeEmbedding(f.landmarks))
    .filter((r): r is NonNullable<typeof r> => r !== null);
  if (!embeddings.length) {
    warnings.push('Could not read the rider’s body geometry from this capture.');
    return null;
  }

  const captureMerge = mergeEmbeddings(embeddings.map((e) => e.embedding));
  const measurements = measureRider(usable);

  // Fold into any existing baseline rather than replacing it. Her body has
  // not changed because she filmed a second horse.
  let embedding = captureMerge.embedding;
  let sampleCount = 1;
  let variance = captureMerge.variance;

  const existing = input.existingRiderBaseline;
  if (existing?.embedding?.length) {
    const merged = mergeEmbeddings([existing.embedding, captureMerge.embedding]);
    embedding = merged.embedding;
    sampleCount = existing.sampleCount + 1;
    variance = merged.variance;

    if (merged.variance > 0.12) {
      warnings.push(
        'This capture disagrees with your last one. If your saddle or your position has changed that is expected; otherwise one of them was filmed badly.',
      );
    }
  }

  const fullBodyRatio = embeddings.filter((e) => e.fullBody).length / embeddings.length;
  if (fullBodyRatio < 0.4) {
    warnings.push('Your legs were hidden for most of this capture — matching will be less certain.');
  }

  const coverageFactor = clamp(input.coverageDegrees / 330, 0, 1);
  const confidence = clamp(
    input.captureQuality * 0.5 + coverageFactor * 0.3 + (1 - Math.min(variance, 0.3) / 0.3) * 0.2,
    0,
    1,
  );

  return {
    userId: input.userId,
    embedding,
    measurements,
    sampleCount,
    sampleVariance: variance,
    confidence,
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Her resting geometry. Taken at rest and on purpose: coaching against a
 * generic ideal tells a short rider on a tall horse she is doing everything
 * wrong. Coaching against her own resting position tells her what changed
 * between standing still and running, which is the part she can act on.
 */
function measureRider(frames: PoseFrame[]): RiderMeasurements {
  const torsoLengths: number[] = [];
  const shoulderWidths: number[] = [];
  const hipWidths: number[] = [];
  const torsoAngles: number[] = [];
  const hipAngles: number[] = [];
  const shoulderTilts: number[] = [];
  const headOffsets: number[] = [];
  const armRatios: number[] = [];
  const legRatios: number[] = [];
  const verticalExtents: number[] = [];

  for (const frame of frames) {
    const lm = frame.landmarks;
    const ref = torsoLength(lm);
    if (ref < 1e-6) continue;

    const shoulderMid = midpoint(lm[POSE.LEFT_SHOULDER]!, lm[POSE.RIGHT_SHOULDER]!);
    const hipMid = midpoint(lm[POSE.LEFT_HIP]!, lm[POSE.RIGHT_HIP]!);

    torsoLengths.push(ref);
    shoulderWidths.push(distance(lm[POSE.LEFT_SHOULDER]!, lm[POSE.RIGHT_SHOULDER]!) / ref);
    hipWidths.push(distance(lm[POSE.LEFT_HIP]!, lm[POSE.RIGHT_HIP]!) / ref);
    torsoAngles.push(angleFromVertical(hipMid, shoulderMid));
    shoulderTilts.push(angleFromHorizontal(lm[POSE.LEFT_SHOULDER]!, lm[POSE.RIGHT_SHOULDER]!));
    headOffsets.push((lm[POSE.NOSE]!.x - shoulderMid.x) / ref);

    hipAngles.push(
      ((angleAt(lm[POSE.LEFT_SHOULDER]!, lm[POSE.LEFT_HIP]!, lm[POSE.LEFT_KNEE]!) +
        angleAt(lm[POSE.RIGHT_SHOULDER]!, lm[POSE.RIGHT_HIP]!, lm[POSE.RIGHT_KNEE]!)) /
        2) *
        (180 / Math.PI),
    );

    armRatios.push(
      (distance(lm[POSE.LEFT_SHOULDER]!, lm[POSE.LEFT_WRIST]!) +
        distance(lm[POSE.RIGHT_SHOULDER]!, lm[POSE.RIGHT_WRIST]!)) /
        2 /
        ref,
    );

    if (lowerBodyVisible(lm)) {
      legRatios.push(
        (distance(lm[POSE.LEFT_HIP]!, lm[POSE.LEFT_ANKLE]!) +
          distance(lm[POSE.RIGHT_HIP]!, lm[POSE.RIGHT_ANKLE]!)) /
          2 /
          ref,
      );
      const heel = midpoint(lm[POSE.LEFT_HEEL]!, lm[POSE.RIGHT_HEEL]!);
      verticalExtents.push(Math.abs(heel.y - lm[POSE.NOSE]!.y));
    }
  }

  return {
    torsoLength: mean(torsoLengths),
    shoulderWidth: mean(shoulderWidths),
    hipWidth: mean(hipWidths),
    restingTorsoAngle: median(torsoAngles),
    restingHipAngle: median(hipAngles),
    restingShoulderTilt: median(shoulderTilts),
    restingHeadOffset: median(headOffsets),
    armToTorsoRatio: mean(armRatios),
    legToTorsoRatio: legRatios.length ? mean(legRatios) : 0,
    verticalExtent: verticalExtents.length ? mean(verticalExtents) : 0,
  };
}

// ---------------------------------------------------------------------------
// Horse
// ---------------------------------------------------------------------------

function buildHorseBaseline(
  horseId: string,
  capturedBy: string,
  frames: HorseFrame[],
  captureQuality: number,
  warnings: string[],
): HorseBaseline | null {
  if (frames.length < 6) return null;

  const measurements = measureHorseConformation(frames);
  if (!measurements) {
    warnings.push('Could not get a clean side-on view of the horse.');
    return null;
  }

  const landmarkSeeds = extractLandmarkSeeds(frames);
  const gaitMetrics = measureGait(frames);
  const seedConfidence = mean(Object.values(landmarkSeeds).map((s) => s.confidence));

  return {
    horseId,
    measurements,
    gaitMetrics: gaitMetrics ?? undefined,
    landmarkSeeds,
    confidence: clamp(captureQuality * 0.6 + seedConfidence * 0.4, 0, 1),
    capturedAt: new Date().toISOString(),
  };
}

/**
 * Gait, which only a turntable capture can give us: on an orbit capture the
 * horse is standing still and there is nothing to measure. Returns null
 * rather than a fabricated number when the horse never moved.
 */
function measureGait(frames: HorseFrame[]): HorseGaitMetrics | null {
  if (frames.length < 20) return null;

  const leftFront: number[] = [];
  const rightFront: number[] = [];
  const leftHind: number[] = [];
  const timestamps: number[] = [];

  for (const frame of frames) {
    const h = frame.landmarks;
    const lf = h[HORSE.LEFT_FRONT_HOOF];
    const rf = h[HORSE.RIGHT_FRONT_HOOF];
    const lh = h[HORSE.LEFT_HIND_HOOF];
    const shoulder = h[HORSE.POINT_OF_SHOULDER];
    const buttock = h[HORSE.POINT_OF_BUTTOCK];
    if (!lf || !rf || !lh || !shoulder || !buttock) continue;
    const bodyLength = distance(shoulder, buttock);
    if (bodyLength < 1e-6) continue;

    leftFront.push(lf.x / bodyLength);
    rightFront.push(rf.x / bodyLength);
    leftHind.push(lh.x / bodyLength);
    timestamps.push(frame.timestampMs);
  }

  if (leftFront.length < 20) return null;

  // A standing horse produces almost no variation in hoof position.
  const movement = standardDeviation(leftFront);
  if (movement < 0.02) return null;

  const strideLength = (Math.max(...leftFront) - Math.min(...leftFront)) / 2;
  const tracking = mean(leftHind) - mean(leftFront);
  const leftRange = Math.max(...leftFront) - Math.min(...leftFront);
  const rightRange = Math.max(...rightFront) - Math.min(...rightFront);
  const symmetry =
    leftRange + rightRange > 1e-6
      ? 1 - Math.abs(leftRange - rightRange) / (leftRange + rightRange)
      : 0;

  const durationSeconds =
    ((timestamps[timestamps.length - 1] ?? 0) - (timestamps[0] ?? 0)) / 1000;
  const crossings = countZeroCrossings(leftFront);
  const strideFrequencyHz = durationSeconds > 0 ? crossings / 2 / durationSeconds : 0;

  return { strideLength, tracking, symmetry, strideFrequencyHz };
}

function countZeroCrossings(series: number[]): number {
  const m = mean(series);
  let crossings = 0;
  for (let i = 1; i < series.length; i++) {
    const previous = (series[i - 1] ?? 0) - m;
    const current = (series[i] ?? 0) - m;
    if (previous <= 0 && current > 0) crossings++;
    if (previous >= 0 && current < 0) crossings++;
  }
  return crossings;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
