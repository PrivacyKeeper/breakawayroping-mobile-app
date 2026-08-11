// src/lib/pose/embedding.ts
//
// 128-dimensional geometric body embedding, adapted from the Clay AI Coach
// shooter-identification engine.
//
// WHAT CHANGED FROM CLAY, AND WHY
//
// Clay's embedding leans hard on the legs: eight of its sixteen limb
// distances and four of its sixteen body proportions are leg measurements.
// That is fine for a shooter standing on flat ground with their whole body
// in frame.
//
// A mounted rider's legs are on the far side of a horse, partly occluded,
// and locked in a riding position that barely varies between people. Those
// dimensions carry almost no identifying signal and a lot of noise, so
// matching a rider on Clay's weighting produces confident wrong answers.
//
// The fix is not to drop the leg dimensions — a rider is sometimes on the
// ground, and the walk-around benchmark is captured with her whole body
// visible — but to weight them by how visible they actually are. A frame
// where the legs are hidden compares on upper-body geometry alone; a frame
// where they are visible uses everything. Both produce a vector in the same
// space, so a benchmark taken on the ground still matches a mounted frame.

import type { PoseEmbedding, PoseLandmark } from './types.ts';
import {
  POSE,
  angleAt,
  distance,
  averageVisibility,
  lowerBodyVisible,
  torsoLength,
} from './landmarks.ts';

export const EMBEDDING_DIMENSIONS = 128;

/**
 * Cosine similarity above which two embeddings are the same person.
 *
 * Clay uses 0.82 for a standing shooter. Mounted frames lose the leg
 * dimensions, which removes discriminating signal and pushes all pairwise
 * similarities up, so the same threshold would produce false matches. 0.86
 * is the mounted equivalent, set from the same false-accept target.
 */
export const MATCH_THRESHOLD_GROUNDED = 0.82;
export const MATCH_THRESHOLD_MOUNTED = 0.86;

/** Dimensions 64-95 are body proportions, several of which are leg-derived. */
const LEG_DERIVED_DIMENSIONS = new Set([
  4, 5, 6, 7, 10, 11, // group 1: leg segment ratios
  70, 71, 76, 77, 78, 79, // group 3: leg-to-torso and upper/lower ratios
  103, // group 4: ankle spread
]);

/** Weight applied to leg-derived dimensions when the lower body is hidden. */
const OCCLUDED_LEG_WEIGHT = 0.15;

export interface EmbeddingResult {
  embedding: PoseEmbedding;
  /** True when the legs were visible enough to contribute fully. */
  fullBody: boolean;
  confidence: number;
}

/**
 * Compute the embedding. Scale-invariant (every distance is a ratio against
 * torso length) and rotation-tolerant (angles and proportions survive
 * in-plane rotation), so it holds as the subject turns through a walk-around.
 */
export function computeEmbedding(landmarks: PoseLandmark[]): EmbeddingResult | null {
  if (!landmarks || landmarks.length < 33) return null;

  const lm = landmarks;
  const ref = torsoLength(lm);
  const legsVisible = lowerBodyVisible(lm);
  const avgVis = averageVisibility(lm);

  const d = (a: number, b: number) => distance(lm[a]!, lm[b]!) / ref;
  const ang = (a: number, b: number, c: number) => angleAt(lm[a]!, lm[b]!, lm[c]!) / Math.PI;

  const e: number[] = [];

  // --- Group 1: limb length ratios (dims 0-31) ---------------------------
  const leftUpperArm = d(POSE.LEFT_SHOULDER, POSE.LEFT_ELBOW);
  const leftForearm = d(POSE.LEFT_ELBOW, POSE.LEFT_WRIST);
  const rightUpperArm = d(POSE.RIGHT_SHOULDER, POSE.RIGHT_ELBOW);
  const rightForearm = d(POSE.RIGHT_ELBOW, POSE.RIGHT_WRIST);
  const leftUpperLeg = d(POSE.LEFT_HIP, POSE.LEFT_KNEE);
  const leftLowerLeg = d(POSE.LEFT_KNEE, POSE.LEFT_ANKLE);
  const rightUpperLeg = d(POSE.RIGHT_HIP, POSE.RIGHT_KNEE);
  const rightLowerLeg = d(POSE.RIGHT_KNEE, POSE.RIGHT_ANKLE);
  const leftArm = d(POSE.LEFT_SHOULDER, POSE.LEFT_WRIST);
  const rightArm = d(POSE.RIGHT_SHOULDER, POSE.RIGHT_WRIST);
  const leftLeg = d(POSE.LEFT_HIP, POSE.LEFT_ANKLE);
  const rightLeg = d(POSE.RIGHT_HIP, POSE.RIGHT_ANKLE);
  const shoulderWidth = d(POSE.LEFT_SHOULDER, POSE.RIGHT_SHOULDER);
  const hipWidth = d(POSE.LEFT_HIP, POSE.RIGHT_HIP);
  const leftNeck = d(POSE.NOSE, POSE.LEFT_SHOULDER);
  const rightNeck = d(POSE.NOSE, POSE.RIGHT_SHOULDER);

  e.push(
    leftUpperArm, leftForearm, rightUpperArm, rightForearm,
    leftUpperLeg, leftLowerLeg, rightUpperLeg, rightLowerLeg,
    leftArm, rightArm, leftLeg, rightLeg,
    shoulderWidth, hipWidth, leftNeck, rightNeck,
  );

  // Cross-ratios: dimensionless, so invariant to camera distance entirely.
  const ratio = (a: number, b: number) => a / (b + 1e-9);
  e.push(
    ratio(leftUpperArm, leftForearm), ratio(rightUpperArm, rightForearm),
    ratio(leftUpperLeg, leftLowerLeg), ratio(rightUpperLeg, rightLowerLeg),
    ratio(leftUpperArm, rightUpperArm), ratio(leftForearm, rightForearm),
    ratio(leftUpperLeg, rightUpperLeg), ratio(leftLowerLeg, rightLowerLeg),
    ratio(shoulderWidth, hipWidth), ratio(leftArm, rightArm),
    ratio(leftLeg, rightLeg), ratio(leftNeck, rightNeck),
    ratio(leftArm, leftLeg), ratio(rightArm, rightLeg),
    ratio(shoulderWidth, leftArm), ratio(hipWidth, leftLeg),
  );

  // --- Group 2: joint angles (dims 32-63) --------------------------------
  const leftElbowAngle = ang(POSE.LEFT_SHOULDER, POSE.LEFT_ELBOW, POSE.LEFT_WRIST);
  const rightElbowAngle = ang(POSE.RIGHT_SHOULDER, POSE.RIGHT_ELBOW, POSE.RIGHT_WRIST);
  const leftKneeAngle = ang(POSE.LEFT_HIP, POSE.LEFT_KNEE, POSE.LEFT_ANKLE);
  const rightKneeAngle = ang(POSE.RIGHT_HIP, POSE.RIGHT_KNEE, POSE.RIGHT_ANKLE);
  const leftShoulderAngle = ang(POSE.LEFT_ELBOW, POSE.LEFT_SHOULDER, POSE.LEFT_HIP);
  const rightShoulderAngle = ang(POSE.RIGHT_ELBOW, POSE.RIGHT_SHOULDER, POSE.RIGHT_HIP);
  const leftHipAngle = ang(POSE.LEFT_SHOULDER, POSE.LEFT_HIP, POSE.LEFT_KNEE);
  const rightHipAngle = ang(POSE.RIGHT_SHOULDER, POSE.RIGHT_HIP, POSE.RIGHT_KNEE);
  const leftTorsoAngle = ang(POSE.LEFT_HIP, POSE.LEFT_SHOULDER, POSE.RIGHT_SHOULDER);
  const rightTorsoAngle = ang(POSE.RIGHT_HIP, POSE.RIGHT_SHOULDER, POSE.LEFT_SHOULDER);
  const leftSpineAngle = ang(POSE.NOSE, POSE.LEFT_SHOULDER, POSE.LEFT_HIP);
  const rightSpineAngle = ang(POSE.NOSE, POSE.RIGHT_SHOULDER, POSE.RIGHT_HIP);

  e.push(
    leftElbowAngle, rightElbowAngle, leftKneeAngle, rightKneeAngle,
    leftShoulderAngle, rightShoulderAngle, leftHipAngle, rightHipAngle,
    leftTorsoAngle, rightTorsoAngle, leftSpineAngle, rightSpineAngle,
  );

  e.push(
    leftElbowAngle - rightElbowAngle,
    leftKneeAngle - rightKneeAngle,
    leftShoulderAngle - rightShoulderAngle,
    leftHipAngle - rightHipAngle,
    leftTorsoAngle - rightTorsoAngle,
    leftSpineAngle - rightSpineAngle,
  );
  while (e.length < 64) e.push(0);

  // --- Group 3: body proportions (dims 64-95) ----------------------------
  const headWidth = d(POSE.LEFT_EAR, POSE.RIGHT_EAR);
  e.push(
    shoulderWidth,                      // already over torso
    hipWidth,
    ratio(shoulderWidth, hipWidth),
    leftArm, rightArm,
    leftLeg, rightLeg,
    ratio(leftArm, leftLeg), ratio(rightArm, rightLeg),
    headWidth,
    leftNeck + rightNeck,
    ratio(leftArm + rightArm, leftLeg + rightLeg),
    ratio(1, leftLeg), ratio(1, rightLeg),
    ratio(leftForearm, leftUpperArm), ratio(rightForearm, rightUpperArm),
  );
  while (e.length < 96) e.push(0);

  // --- Group 4: symmetry and cross-body (dims 96-127) --------------------
  const shoulderMidX = (lm[POSE.LEFT_SHOULDER]!.x + lm[POSE.RIGHT_SHOULDER]!.x) / 2;
  const hipMidX = (lm[POSE.LEFT_HIP]!.x + lm[POSE.RIGHT_HIP]!.x) / 2;
  e.push(
    ratio(leftArm, rightArm) - 1,
    ratio(leftLeg, rightLeg) - 1,
    lm[POSE.LEFT_SHOULDER]!.y - lm[POSE.RIGHT_SHOULDER]!.y,
    lm[POSE.LEFT_HIP]!.y - lm[POSE.RIGHT_HIP]!.y,
    lm[POSE.NOSE]!.x - (shoulderMidX + hipMidX) / 2,
    d(POSE.LEFT_WRIST, POSE.RIGHT_HIP),
    d(POSE.RIGHT_WRIST, POSE.LEFT_HIP),
    d(POSE.LEFT_ANKLE, POSE.RIGHT_ANKLE),
    avgVis,
  );
  while (e.length < EMBEDDING_DIMENSIONS) e.push(0);

  const raw = e.slice(0, EMBEDDING_DIMENSIONS);

  // Down-weight leg-derived dimensions when the legs are not really visible.
  // Applied before normalisation so the vector stays on the unit sphere.
  if (!legsVisible) {
    for (const i of LEG_DERIVED_DIMENSIONS) {
      raw[i] = (raw[i] ?? 0) * OCCLUDED_LEG_WEIGHT;
    }
  }

  return {
    embedding: l2Normalise(raw),
    fullBody: legsVisible,
    confidence: avgVis * (legsVisible ? 1 : 0.85),
  };
}

export function l2Normalise(vector: number[]): number[] {
  let norm = 0;
  for (const v of vector) norm += v * v;
  norm = Math.sqrt(norm);
  if (norm < 1e-9) return vector.slice();
  return vector.map((v) => v / norm);
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length || a.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;
  for (let i = 0; i < a.length; i++) {
    const ai = a[i] ?? 0;
    const bi = b[i] ?? 0;
    dot += ai * bi;
    normA += ai * ai;
    normB += bi * bi;
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB) + 1e-9);
}

/**
 * Pick a known rider out of the people detected in a frame.
 *
 * Threshold depends on whether the candidate frame showed the legs, because
 * a mounted frame has less to go on. Returns null rather than a best guess:
 * attributing one rider's run to another is worse than declining to attribute
 * it at all, particularly in a coach's team report.
 */
export function findMatchingRider(
  frameEmbedding: PoseEmbedding,
  candidates: Array<{ id: string; embedding: PoseEmbedding }>,
  options: { mounted?: boolean } = {},
): { id: string; score: number } | null {
  const threshold = options.mounted ? MATCH_THRESHOLD_MOUNTED : MATCH_THRESHOLD_GROUNDED;
  let best: { id: string; score: number } | null = null;

  for (const candidate of candidates) {
    const score = cosineSimilarity(frameEmbedding, candidate.embedding);
    if (score >= threshold && (!best || score > best.score)) {
      best = { id: candidate.id, score };
    }
  }
  return best;
}

/**
 * Fold several captures of the same rider into one baseline embedding.
 *
 * A rider who walks around three horses has measured herself three times.
 * Averaging the unit vectors and renormalising cancels per-capture noise,
 * and the spread across them is a free confidence signal: captures that
 * disagree mean at least one of them was bad.
 */
export function mergeEmbeddings(embeddings: PoseEmbedding[]): {
  embedding: PoseEmbedding;
  variance: number;
} {
  if (!embeddings.length) return { embedding: [], variance: 1 };
  if (embeddings.length === 1) {
    return { embedding: embeddings[0]!.slice(), variance: 0 };
  }

  const summed = new Array(EMBEDDING_DIMENSIONS).fill(0);
  for (const embedding of embeddings) {
    for (let i = 0; i < EMBEDDING_DIMENSIONS; i++) {
      summed[i] += embedding[i] ?? 0;
    }
  }
  const merged = l2Normalise(summed.map((v) => v / embeddings.length));

  let pairs = 0;
  let disagreement = 0;
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      disagreement += 1 - cosineSimilarity(embeddings[i]!, embeddings[j]!);
      pairs++;
    }
  }

  return { embedding: merged, variance: pairs ? disagreement / pairs : 0 };
}
