// src/lib/pose/landmarks.ts
//
// Landmark indices, model-format normalisation and the geometry primitives
// everything else in this folder is built from.

import type { PoseLandmark } from './types.ts';

/** 33 MediaPipe / BlazePose landmarks. Indices match the MediaPipe spec. */
export const POSE = {
  NOSE: 0,
  LEFT_EYE_INNER: 1, LEFT_EYE: 2, LEFT_EYE_OUTER: 3,
  RIGHT_EYE_INNER: 4, RIGHT_EYE: 5, RIGHT_EYE_OUTER: 6,
  LEFT_EAR: 7, RIGHT_EAR: 8,
  MOUTH_LEFT: 9, MOUTH_RIGHT: 10,
  LEFT_SHOULDER: 11, RIGHT_SHOULDER: 12,
  LEFT_ELBOW: 13, RIGHT_ELBOW: 14,
  LEFT_WRIST: 15, RIGHT_WRIST: 16,
  LEFT_PINKY: 17, RIGHT_PINKY: 18,
  LEFT_INDEX: 19, RIGHT_INDEX: 20,
  LEFT_THUMB: 21, RIGHT_THUMB: 22,
  LEFT_HIP: 23, RIGHT_HIP: 24,
  LEFT_KNEE: 25, RIGHT_KNEE: 26,
  LEFT_ANKLE: 27, RIGHT_ANKLE: 28,
  LEFT_HEEL: 29, RIGHT_HEEL: 30,
  LEFT_FOOT_INDEX: 31, RIGHT_FOOT_INDEX: 32,
} as const;

/**
 * Horse landmarks. There is no industry-standard index set for quadrupeds
 * the way there is for people, so this is ours and the horse pose adapter is
 * responsible for mapping whatever model we run into it.
 *
 * Chosen to be the points a horseperson would actually name, because the
 * measurements built from them have to be defensible to someone who knows
 * horses better than we do.
 */
export const HORSE = {
  POLL: 0,
  MUZZLE: 1,
  THROATLATCH: 2,
  CREST: 3,
  WITHERS: 4,
  BACK: 5,
  LOIN: 6,
  CROUP: 7,
  TAIL_HEAD: 8,
  POINT_OF_SHOULDER: 9,
  POINT_OF_HIP: 10,
  POINT_OF_BUTTOCK: 11,
  ELBOW: 12,
  STIFLE: 13,
  LEFT_KNEE: 14, RIGHT_KNEE: 15,
  LEFT_HOCK: 16, RIGHT_HOCK: 17,
  LEFT_FRONT_FETLOCK: 18, RIGHT_FRONT_FETLOCK: 19,
  LEFT_HIND_FETLOCK: 20, RIGHT_HIND_FETLOCK: 21,
  LEFT_FRONT_HOOF: 22, RIGHT_FRONT_HOOF: 23,
  LEFT_HIND_HOOF: 24, RIGHT_HIND_HOOF: 25,
  GIRTH_TOP: 26,
  GIRTH_BOTTOM: 27,
} as const;

export const HORSE_LANDMARK_COUNT = 28;

export type LandmarkIndex = number;

// ---------------------------------------------------------------------------
// Model format normalisation
// ---------------------------------------------------------------------------

/**
 * MoveNet emits 17 keypoints; BlazePose emits 33. Every downstream
 * computation assumes 33, so a 17-point frame is expanded by interpolating
 * the face detail and extrapolating hands and feet from the wrist and ankle.
 *
 * The expanded points are approximations and are marked with reduced
 * visibility so anything that weights by confidence discounts them.
 */
export function expandTo33(landmarks: PoseLandmark[]): PoseLandmark[] {
  if (landmarks.length >= 33) return landmarks;
  if (landmarks.length !== 17) return landmarks;

  // MoveNet order: nose, L/R eye, L/R ear, L/R shoulder, L/R elbow, L/R wrist,
  // L/R hip, L/R knee, L/R ankle.
  const [
    nose, leftEye, rightEye, leftEar, rightEar,
    leftShoulder, rightShoulder, leftElbow, rightElbow,
    leftWrist, rightWrist, leftHip, rightHip,
    leftKnee, rightKnee, leftAnkle, rightAnkle,
  ] = landmarks as PoseLandmark[];

  const lerp = (a: PoseLandmark, b: PoseLandmark, t: number): PoseLandmark => ({
    x: a.x + (b.x - a.x) * t,
    y: a.y + (b.y - a.y) * t,
    z: a.z + (b.z - a.z) * t,
    visibility: Math.min(a.visibility, b.visibility) * 0.8,
  });

  const offset = (a: PoseLandmark, dx: number, dy: number): PoseLandmark => ({
    x: a.x + dx,
    y: a.y + dy,
    z: a.z,
    visibility: a.visibility * 0.6,
  });

  const out: PoseLandmark[] = new Array(33);
  out[POSE.NOSE] = nose!;
  out[POSE.LEFT_EYE_INNER] = lerp(nose!, leftEye!, 0.5);
  out[POSE.LEFT_EYE] = leftEye!;
  out[POSE.LEFT_EYE_OUTER] = lerp(leftEye!, leftEar!, 0.4);
  out[POSE.RIGHT_EYE_INNER] = lerp(nose!, rightEye!, 0.5);
  out[POSE.RIGHT_EYE] = rightEye!;
  out[POSE.RIGHT_EYE_OUTER] = lerp(rightEye!, rightEar!, 0.4);
  out[POSE.LEFT_EAR] = leftEar!;
  out[POSE.RIGHT_EAR] = rightEar!;
  out[POSE.MOUTH_LEFT] = lerp(nose!, leftEye!, -0.3);
  out[POSE.MOUTH_RIGHT] = lerp(nose!, rightEye!, -0.3);
  out[POSE.LEFT_SHOULDER] = leftShoulder!;
  out[POSE.RIGHT_SHOULDER] = rightShoulder!;
  out[POSE.LEFT_ELBOW] = leftElbow!;
  out[POSE.RIGHT_ELBOW] = rightElbow!;
  out[POSE.LEFT_WRIST] = leftWrist!;
  out[POSE.RIGHT_WRIST] = rightWrist!;
  out[POSE.LEFT_PINKY] = offset(leftWrist!, -0.01, 0.02);
  out[POSE.RIGHT_PINKY] = offset(rightWrist!, 0.01, 0.02);
  out[POSE.LEFT_INDEX] = offset(leftWrist!, 0.01, 0.02);
  out[POSE.RIGHT_INDEX] = offset(rightWrist!, -0.01, 0.02);
  out[POSE.LEFT_THUMB] = offset(leftWrist!, 0.005, 0.015);
  out[POSE.RIGHT_THUMB] = offset(rightWrist!, -0.005, 0.015);
  out[POSE.LEFT_HIP] = leftHip!;
  out[POSE.RIGHT_HIP] = rightHip!;
  out[POSE.LEFT_KNEE] = leftKnee!;
  out[POSE.RIGHT_KNEE] = rightKnee!;
  out[POSE.LEFT_ANKLE] = leftAnkle!;
  out[POSE.RIGHT_ANKLE] = rightAnkle!;
  out[POSE.LEFT_HEEL] = offset(leftAnkle!, -0.005, 0.01);
  out[POSE.RIGHT_HEEL] = offset(rightAnkle!, 0.005, 0.01);
  out[POSE.LEFT_FOOT_INDEX] = offset(leftAnkle!, 0.02, 0.015);
  out[POSE.RIGHT_FOOT_INDEX] = offset(rightAnkle!, -0.02, 0.015);
  return out;
}

// ---------------------------------------------------------------------------
// Geometry primitives
// ---------------------------------------------------------------------------

const EPS = 1e-9;

export function distance(a: PoseLandmark, b: PoseLandmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

export function midpoint(a: PoseLandmark, b: PoseLandmark): PoseLandmark {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2,
    z: (a.z + b.z) / 2,
    visibility: Math.min(a.visibility, b.visibility),
  };
}

/** Interior angle at vertex b, in radians, via the dot product. */
export function angleAt(a: PoseLandmark, b: PoseLandmark, c: PoseLandmark): number {
  const abx = a.x - b.x;
  const aby = a.y - b.y;
  const cbx = c.x - b.x;
  const cby = c.y - b.y;
  const dot = abx * cbx + aby * cby;
  const mag = Math.hypot(abx, aby) * Math.hypot(cbx, cby);
  if (mag < EPS) return 0;
  return Math.acos(Math.max(-1, Math.min(1, dot / mag)));
}

/** Angle of the vector a->b measured from vertical, in degrees. */
export function angleFromVertical(a: PoseLandmark, b: PoseLandmark): number {
  return Math.atan2(b.x - a.x, a.y - b.y) * (180 / Math.PI);
}

/** Angle of the line a->b measured from horizontal, in degrees. */
export function angleFromHorizontal(a: PoseLandmark, b: PoseLandmark): number {
  return Math.atan2(b.y - a.y, b.x - a.x) * (180 / Math.PI);
}

export function averageVisibility(landmarks: PoseLandmark[]): number {
  if (!landmarks.length) return 0;
  return landmarks.reduce((s, l) => s + l.visibility, 0) / landmarks.length;
}

/**
 * Reference length everything else is normalised against. Torso is used
 * rather than height because it is the most reliably visible segment on a
 * mounted rider, whose legs are behind the horse's barrel.
 */
export function torsoLength(lm: PoseLandmark[]): number {
  const shoulder = midpoint(lm[POSE.LEFT_SHOULDER]!, lm[POSE.RIGHT_SHOULDER]!);
  const hip = midpoint(lm[POSE.LEFT_HIP]!, lm[POSE.RIGHT_HIP]!);
  return Math.max(distance(shoulder, hip), EPS);
}

/** True when enough of the lower body is visible to trust leg-derived values. */
export function lowerBodyVisible(lm: PoseLandmark[], threshold = 0.3): boolean {
  if (lm.length < 33) return false;
  return (
    (lm[POSE.LEFT_ANKLE]?.visibility ?? 0) > threshold &&
    (lm[POSE.RIGHT_ANKLE]?.visibility ?? 0) > threshold &&
    (lm[POSE.LEFT_KNEE]?.visibility ?? 0) > threshold &&
    (lm[POSE.RIGHT_KNEE]?.visibility ?? 0) > threshold
  );
}

export function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

export function mean(values: number[]): number {
  if (!values.length) return 0;
  return values.reduce((s, v) => s + v, 0) / values.length;
}

export function standardDeviation(values: number[]): number {
  if (values.length < 2) return 0;
  const m = mean(values);
  return Math.sqrt(mean(values.map((v) => (v - m) ** 2)));
}
