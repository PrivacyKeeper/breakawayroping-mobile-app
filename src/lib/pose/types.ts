// src/lib/pose/types.ts
//
// Shared types for the run-analysis pipeline.
//
// The pipeline has three stages and this file describes the boundary between
// each of them:
//
//   1. CAPTURE   a walk-around video of horse and rider standing still,
//                head to hooves, producing RiderBaseline + HorseBaseline
//   2. MEASURE   a run video reduced to a RunMeasurement — a flat bag of
//                numbers expressed as deviation from those baselines
//   3. JUDGE     the measurement compared against the fault taxonomy,
//                producing DetectedFault[] with stable codes
//
// Stage 3 is deliberately separate from stage 2. Measuring and judging are
// different jobs: the measurement is what happened, the fault is what we
// think about it. Thresholds move as we learn; the measurements should not
// have to be recomputed when they do.

export interface PoseLandmark {
  /** Normalised 0-1 across image width. */
  x: number;
  /** Normalised 0-1 across image height. */
  y: number;
  /** Depth relative to the hips, in the pose model's own units. */
  z: number;
  /** Model confidence for this landmark, 0-1. */
  visibility: number;
}

export interface PoseFrame {
  timestampMs: number;
  /** Length 33. A 17-keypoint model is expanded before it gets here. */
  landmarks: PoseLandmark[];
}

/** Horse landmarks, in the same normalised image space as PoseLandmark. */
export interface HorseFrame {
  timestampMs: number;
  landmarks: PoseLandmark[];
}

/** 128-dimensional L2-normalised geometric embedding. */
export type PoseEmbedding = number[];

// ---------------------------------------------------------------------------
// Capture
// ---------------------------------------------------------------------------

/**
 * 'orbit'      camera walks around a stationary horse and rider. Best data:
 *              the subject never changes, so every frame is the same pose
 *              from a new angle. Needs a second person.
 * 'turntable'  horse walks a circle in front of a fixed camera. She can do
 *              it alone. Noisier for build, but it is the only one that
 *              yields gait.
 */
export type CaptureMethod = 'orbit' | 'turntable';

export type CaptureQualityFlag =
  | 'partial_coverage'
  | 'subject_cropped'
  | 'low_visibility'
  | 'camera_too_fast'
  | 'camera_unsteady'
  | 'subject_moved'
  | 'horse_not_found'
  | 'rider_not_found';

export interface CaptureGuidance {
  /** What the app tells her right now, in her words not ours. */
  message: string;
  status: 'good' | 'adjust' | 'blocked';
  /** 0-360, how far around the subject the capture has got. */
  coverageDegrees: number;
  /** Detected on the fly so she does not have to declare it up front. */
  detectedMethod: CaptureMethod | 'unknown';
  flags: CaptureQualityFlag[];
  canFinish: boolean;
}

// ---------------------------------------------------------------------------
// Baselines
// ---------------------------------------------------------------------------

/**
 * The rider's resting geometry. Every run measurement is expressed as a
 * deviation from this, so coaching is against her own body rather than
 * against a generic ideal.
 */
export interface RiderBaseline {
  id?: string;
  userId: string;
  embedding: PoseEmbedding;
  measurements: RiderMeasurements;
  sampleCount: number;
  /** Mean pairwise disagreement across samples, 0-1. High means recapture. */
  sampleVariance?: number;
  confidence: number;
  capturedAt: string;
}

export interface RiderMeasurements {
  /** Shoulder midpoint to hip midpoint, normalised by subject height. */
  torsoLength: number;
  shoulderWidth: number;
  hipWidth: number;
  /** Torso angle from vertical at rest, degrees. Her natural seat. */
  restingTorsoAngle: number;
  /** Hip angle at rest, degrees. */
  restingHipAngle: number;
  /** Shoulder line angle at rest, degrees. Most riders are not square. */
  restingShoulderTilt: number;
  /** Head position relative to the shoulder midpoint at rest. */
  restingHeadOffset: number;
  armToTorsoRatio: number;
  legToTorsoRatio: number;
  /** Full standing extent head to heel, normalised by frame height. */
  verticalExtent: number;
  [key: string]: number;
}

/**
 * The horse's resting geometry and, when the capture was a turntable, how it
 * moves. Belongs to the horse, not to the rider/horse pairing.
 */
export interface HorseBaseline {
  id?: string;
  horseId: string;
  measurements: HorseMeasurements;
  gaitMetrics?: HorseGaitMetrics;
  /** Seeds the run tracker so it does not have to find joints cold. */
  landmarkSeeds: Record<string, { x: number; y: number; confidence: number }>;
  confidence: number;
  capturedAt: string;
}

export interface HorseMeasurements {
  /** Ground to withers, normalised by total body length. The scale anchor. */
  withersHeight: number;
  /** Point of shoulder to point of buttock. */
  bodyLength: number;
  toplineLength: number;
  /** Degrees. A steeper shoulder changes how a horse can reach. */
  shoulderAngle: number;
  hipAngle: number;
  /** Withers to underline over total height. Depth of heart girth. */
  chestDepth: number;
  cannonToForearmRatio: number;
  /** Height at croup minus height at withers. Positive means built downhill. */
  levelness: number;
  [key: string]: number;
}

export interface HorseGaitMetrics {
  /** Stride length at walk, normalised by body length. */
  strideLength: number;
  /** How far the hind foot lands past the front print. Negative = short. */
  tracking: number;
  /** Left/right stride symmetry, 0-1 where 1 is perfectly even. */
  symmetry: number;
  strideFrequencyHz: number;
}

// ---------------------------------------------------------------------------
// Measurement
// ---------------------------------------------------------------------------

/**
 * Segments are named per event — see src/lib/pose/events/. Kept as a string
 * rather than a union so the shared engine does not have to know that a
 * breakaway run has one throw and a ranch rodeo has five events.
 */
export type RunSegment = string;

export interface KeyMoment {
  key: string;
  label: string;
  tMs: number;
  segment: RunSegment;
}

/**
 * The feature vector. Flat and open-keyed so features can be added without a
 * migration; see barrel.ts for the keys actually emitted.
 */
export type RunFeatures = Record<string, number>;

export interface RunMeasurement {
  features: RunFeatures;
  /** Millisecond offsets from run start, keyed by segment. */
  segments: Partial<Record<RunSegment, { startMs: number; endMs: number }>>;
  keyMoments: KeyMoment[];
  /** 0-1 split of measured contribution. Null when no horse baseline. */
  horseContribution: number | null;
  engineVersion: string;
  poseModel: string;
  confidence: number;
  riderBaselineId?: string;
  horseBaselineId?: string;
}

// ---------------------------------------------------------------------------
// Faults
// ---------------------------------------------------------------------------

export type FaultSeverity = 'low' | 'medium' | 'high';
export type FaultAttribution = 'rider' | 'horse' | 'pair';

export interface FaultDefinition {
  code: string;
  label: string;
  /** Shown to the rider. Plain language, no jargon, no scolding. */
  description: string;
  segment: RunSegment | 'whole_run';
  attributedTo: FaultAttribution;
  /** Feature key this fault is judged from. */
  feature: string;
  /**
   * Deviation from baseline at which each severity trips. Units match the
   * feature. Ordered low -> high; a run trips the highest band it clears.
   */
  thresholds: { low: number; medium: number; high: number };
  /** True when a LOWER value is the fault (e.g. not enough drive). */
  inverted?: boolean;
  /** What to actually go do about it. */
  drill: string;
}

export interface DetectedFault {
  code: string;
  taxonomyVersion: string;
  segment: RunSegment | 'whole_run';
  attributedTo: FaultAttribution;
  severity: FaultSeverity;
  measuredValue: number;
  baselineValue: number | null;
  deviation: number;
  tMs: number | null;
  confidence: number;
}
