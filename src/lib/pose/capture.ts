// src/lib/pose/capture.ts
//
// Walk-around benchmark capture: real-time guidance while she films, and the
// coverage bookkeeping that decides whether the capture is good enough to
// build a baseline from.
//
// Clay has detectCameraStability(), which flags a HANDHELD camera as a
// problem because a shooter is filmed from a fixed position. Here the camera
// is *supposed* to move, so that logic is inverted: motion is expected, and
// what we are actually watching for is the difference between a smooth
// deliberate orbit and somebody waving a phone around.
//
// Coverage is estimated from foreshortening rather than from device motion,
// which has the useful property of working for both capture methods. Seen
// from the side, a horse presents its full body length; seen head-on it
// presents almost none. The ratio of apparent length to apparent height
// traces a predictable curve as the viewing angle goes around, and
// integrating the change in that curve gives angular coverage without
// needing the gyroscope or any knowledge of which thing is moving.

import type {
  CaptureGuidance,
  CaptureMethod,
  CaptureQualityFlag,
  HorseFrame,
  PoseFrame,
  PoseLandmark,
} from './types.ts';
import {
  HORSE,
  POSE,
  averageVisibility,
  clamp,
  distance,
  mean,
  standardDeviation,
} from './landmarks.ts';

/** Below this, the capture cannot produce a usable baseline. */
export const MINIMUM_COVERAGE_DEGREES = 200;
/** Above this, extra filming adds nothing. */
export const TARGET_COVERAGE_DEGREES = 330;

/** Frame-to-frame landmark displacement, normalised units. */
const JITTER_STEADY = 0.004;
const JITTER_ORBIT_MAX = 0.035;
const MIN_LANDMARK_VISIBILITY = 0.35;

interface CaptureSample {
  timestampMs: number;
  /** Apparent length / apparent height. Low near head-on, high side-on. */
  aspect: number;
  jitter: number;
  visibility: number;
  subjectCentroid: { x: number; y: number };
  cropped: boolean;
}

export class BenchmarkCaptureSession {
  private samples: CaptureSample[] = [];
  private coverage = 0;
  private lastAspect: number | null = null;
  private aspectRange = { min: Number.POSITIVE_INFINITY, max: 0 };
  private previousLandmarks: PoseLandmark[] | null = null;

  reset(): void {
    this.samples = [];
    this.coverage = 0;
    this.lastAspect = null;
    this.aspectRange = { min: Number.POSITIVE_INFINITY, max: 0 };
    this.previousLandmarks = null;
  }

  /**
   * Feed one frame. Returns what to tell her right now.
   *
   * The horse frame is optional because the horse pose model may not have
   * locked on yet; rider-only capture still produces a rider baseline.
   */
  push(rider: PoseFrame | null, horse: HorseFrame | null): CaptureGuidance {
    const flags: CaptureQualityFlag[] = [];

    if (!rider || rider.landmarks.length < 33) {
      flags.push('rider_not_found');
      return this.guidance('Point the camera at the horse and rider', 'blocked', 'unknown', flags);
    }

    const lm = rider.landmarks;
    const visibility = averageVisibility(lm);
    if (visibility < MIN_LANDMARK_VISIBILITY) flags.push('low_visibility');

    const jitter = this.computeJitter(lm);
    this.previousLandmarks = lm;

    const cropped = this.isCropped(lm, horse);
    if (cropped) flags.push('subject_cropped');

    const aspect = this.computeAspect(lm, horse);
    if (!horse) flags.push('horse_not_found');

    const centroid = this.centroid(lm);
    this.samples.push({
      timestampMs: rider.timestampMs,
      aspect,
      jitter,
      visibility,
      subjectCentroid: centroid,
      cropped,
    });

    this.accumulateCoverage(aspect);

    if (jitter > JITTER_ORBIT_MAX) flags.push('camera_too_fast');
    else if (this.isUnsteady()) flags.push('camera_unsteady');

    const method = this.detectMethod();
    return this.buildGuidance(method, flags, cropped, visibility, jitter);
  }

  get coverageDegrees(): number {
    return Math.min(360, this.coverage);
  }

  get frameCount(): number {
    return this.samples.length;
  }

  get durationMs(): number {
    if (this.samples.length < 2) return 0;
    return (
      (this.samples[this.samples.length - 1]?.timestampMs ?? 0) -
      (this.samples[0]?.timestampMs ?? 0)
    );
  }

  /**
   * 0-1 composite. Coverage is weighted highest because a capture that never
   * got around the far side cannot be rescued by being sharp.
   */
  get qualityScore(): number {
    if (!this.samples.length) return 0;
    const coverageScore = clamp(this.coverageDegrees / TARGET_COVERAGE_DEGREES, 0, 1);
    const visibilityScore = clamp(mean(this.samples.map((s) => s.visibility)) / 0.7, 0, 1);
    const steadinessScore = clamp(
      1 - standardDeviation(this.samples.map((s) => s.jitter)) / JITTER_ORBIT_MAX,
      0,
      1,
    );
    const croppedRatio = this.samples.filter((s) => s.cropped).length / this.samples.length;
    const framingScore = clamp(1 - croppedRatio * 1.5, 0, 1);

    return (
      coverageScore * 0.45 +
      visibilityScore * 0.2 +
      steadinessScore * 0.15 +
      framingScore * 0.2
    );
  }

  get qualityFlags(): CaptureQualityFlag[] {
    const flags: CaptureQualityFlag[] = [];
    if (this.coverageDegrees < MINIMUM_COVERAGE_DEGREES) flags.push('partial_coverage');
    if (!this.samples.length) return flags;
    if (mean(this.samples.map((s) => s.visibility)) < 0.5) flags.push('low_visibility');
    if (this.samples.filter((s) => s.cropped).length / this.samples.length > 0.2) {
      flags.push('subject_cropped');
    }
    if (mean(this.samples.map((s) => s.jitter)) > JITTER_ORBIT_MAX * 0.8) {
      flags.push('camera_unsteady');
    }
    return flags;
  }

  /**
   * Which method she actually used. Detected rather than declared, so she
   * does not have to answer a question before she starts filming.
   *
   * Orbit means the camera is moving, which shows up as sustained
   * whole-frame landmark displacement. Turntable means the camera is still
   * and the horse is walking, which shows low jitter but advancing coverage.
   */
  detectMethod(): CaptureMethod | 'unknown' {
    if (this.samples.length < 12) return 'unknown';
    const recent = this.samples.slice(-40);
    const avgJitter = mean(recent.map((s) => s.jitter));
    const centroidDrift = standardDeviation(recent.map((s) => s.subjectCentroid.x));

    if (avgJitter > JITTER_STEADY * 2.5) return 'orbit';
    if (avgJitter <= JITTER_STEADY * 2.5 && centroidDrift > 0.02) return 'turntable';
    if (this.coverage > 30) return 'turntable';
    return 'unknown';
  }

  // -------------------------------------------------------------------------

  private computeJitter(landmarks: PoseLandmark[]): number {
    if (!this.previousLandmarks) return 0;
    const previous = this.previousLandmarks;
    const displacements: number[] = [];
    for (let i = 0; i < landmarks.length; i++) {
      const current = landmarks[i];
      const before = previous[i];
      if (!current || !before) continue;
      if (current.visibility < 0.5 || before.visibility < 0.5) continue;
      displacements.push(distance(current, before));
    }
    return displacements.length ? mean(displacements) : 0;
  }

  /**
   * Apparent length over apparent height. The horse gives the cleaner signal
   * because it is long and low; the rider alone is a fallback and uses
   * shoulder width against torso length for the same purpose.
   */
  private computeAspect(riderLandmarks: PoseLandmark[], horse: HorseFrame | null): number {
    if (horse && horse.landmarks.length >= 12) {
      const h = horse.landmarks;
      const shoulder = h[HORSE.POINT_OF_SHOULDER];
      const buttock = h[HORSE.POINT_OF_BUTTOCK];
      const withers = h[HORSE.WITHERS];
      const girth = h[HORSE.GIRTH_BOTTOM];
      if (shoulder && buttock && withers && girth) {
        const length = distance(shoulder, buttock);
        const height = Math.max(distance(withers, girth), 1e-6);
        return length / height;
      }
    }

    const leftShoulder = riderLandmarks[POSE.LEFT_SHOULDER]!;
    const rightShoulder = riderLandmarks[POSE.RIGHT_SHOULDER]!;
    const leftHip = riderLandmarks[POSE.LEFT_HIP]!;
    const rightHip = riderLandmarks[POSE.RIGHT_HIP]!;
    const width = distance(leftShoulder, rightShoulder);
    const height = Math.max(
      distance(
        { ...leftShoulder, x: (leftShoulder.x + rightShoulder.x) / 2, y: (leftShoulder.y + rightShoulder.y) / 2 },
        { ...leftHip, x: (leftHip.x + rightHip.x) / 2, y: (leftHip.y + rightHip.y) / 2 },
      ),
      1e-6,
    );
    return width / height;
  }

  /**
   * Convert the change in foreshortening into degrees travelled.
   *
   * aspect is proportional to |sin(theta)| where theta is the viewing angle
   * relative to head-on, so d(theta) recovers from d(aspect) once the range
   * has been observed. Early frames have no range yet, so coverage only
   * starts accumulating once the capture has seen enough variation to
   * calibrate — which is why the guidance asks her to start from the side.
   */
  private accumulateCoverage(aspect: number): void {
    this.aspectRange.min = Math.min(this.aspectRange.min, aspect);
    this.aspectRange.max = Math.max(this.aspectRange.max, aspect);

    const span = this.aspectRange.max - this.aspectRange.min;
    if (span < 0.15) {
      this.lastAspect = aspect;
      return;
    }

    if (this.lastAspect !== null) {
      const normalisedPrevious = clamp(
        (this.lastAspect - this.aspectRange.min) / span,
        0,
        1,
      );
      const normalisedCurrent = clamp((aspect - this.aspectRange.min) / span, 0, 1);
      const thetaPrevious = Math.asin(Math.sqrt(normalisedPrevious));
      const thetaCurrent = Math.asin(Math.sqrt(normalisedCurrent));
      const delta = Math.abs(thetaCurrent - thetaPrevious) * (180 / Math.PI) * 2;
      // Reject implausible single-frame jumps, which are tracking glitches
      // rather than the operator teleporting around the horse.
      if (delta < 12) this.coverage += delta;
    }
    this.lastAspect = aspect;
  }

  private isCropped(riderLandmarks: PoseLandmark[], horse: HorseFrame | null): boolean {
    const margin = 0.02;
    const outOfFrame = (l: PoseLandmark | undefined) =>
      !l || l.x < margin || l.x > 1 - margin || l.y < margin || l.y > 1 - margin;

    // The rider's head is the top of the required extent.
    if (outOfFrame(riderLandmarks[POSE.NOSE])) return true;

    if (horse && horse.landmarks.length >= HORSE.RIGHT_HIND_HOOF) {
      const hooves = [
        horse.landmarks[HORSE.LEFT_FRONT_HOOF],
        horse.landmarks[HORSE.RIGHT_FRONT_HOOF],
        horse.landmarks[HORSE.LEFT_HIND_HOOF],
        horse.landmarks[HORSE.RIGHT_HIND_HOOF],
      ];
      const visibleHooves = hooves.filter((h) => h && h.visibility > 0.3);
      if (visibleHooves.length < 2) return true;
      if (visibleHooves.some(outOfFrame)) return true;
    }
    return false;
  }

  private centroid(landmarks: PoseLandmark[]): { x: number; y: number } {
    const points = [
      landmarks[POSE.LEFT_SHOULDER],
      landmarks[POSE.RIGHT_SHOULDER],
      landmarks[POSE.LEFT_HIP],
      landmarks[POSE.RIGHT_HIP],
    ].filter(Boolean) as PoseLandmark[];
    return {
      x: mean(points.map((p) => p.x)),
      y: mean(points.map((p) => p.y)),
    };
  }

  private isUnsteady(): boolean {
    if (this.samples.length < 10) return false;
    const recent = this.samples.slice(-10).map((s) => s.jitter);
    return standardDeviation(recent) > JITTER_ORBIT_MAX * 0.5;
  }

  private buildGuidance(
    method: CaptureMethod | 'unknown',
    flags: CaptureQualityFlag[],
    cropped: boolean,
    visibility: number,
    jitter: number,
  ): CaptureGuidance {
    const coverage = this.coverageDegrees;
    const canFinish = coverage >= MINIMUM_COVERAGE_DEGREES && !cropped;

    if (cropped) {
      return this.guidance(
        'Step back — we need the top of her head to the horse’s hooves',
        'adjust',
        method,
        flags,
      );
    }
    if (visibility < MIN_LANDMARK_VISIBILITY) {
      return this.guidance('Too dark to measure — find better light', 'adjust', method, flags);
    }
    if (jitter > JITTER_ORBIT_MAX) {
      return this.guidance('Slow down', 'adjust', method, flags);
    }
    if (coverage < 45) {
      return this.guidance(
        method === 'turntable'
          ? 'Good — let her walk on around'
          : 'Start walking around them, slow and steady',
        'good',
        method,
        flags,
      );
    }
    if (coverage < MINIMUM_COVERAGE_DEGREES) {
      return this.guidance(
        `Keep going — ${Math.round(coverage)}° of the way around`,
        'good',
        method,
        flags,
      );
    }
    if (coverage < TARGET_COVERAGE_DEGREES) {
      return this.guidance('Enough to work with. All the way around is better', 'good', method, flags);
    }
    return this.guidance('Got it — you can stop', 'good', method, flags);
  }

  private guidance(
    message: string,
    status: CaptureGuidance['status'],
    detectedMethod: CaptureMethod | 'unknown',
    flags: CaptureQualityFlag[],
  ): CaptureGuidance {
    return {
      message,
      status,
      coverageDegrees: this.coverageDegrees,
      detectedMethod,
      flags,
      canFinish: this.coverageDegrees >= MINIMUM_COVERAGE_DEGREES,
    };
  }

  /** Frames retained for baseline extraction, thinned to one per ~5 degrees. */
  sampledFrameIndices(): number[] {
    if (this.samples.length < 2) return this.samples.map((_, i) => i);
    const step = Math.max(1, Math.floor(this.samples.length / 72));
    const indices: number[] = [];
    for (let i = 0; i < this.samples.length; i += step) indices.push(i);
    return indices;
  }
}
