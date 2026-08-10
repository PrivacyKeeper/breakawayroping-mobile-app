// src/lib/pose/horse.ts
//
// The horse side of the pipeline.
//
// STATE OF THIS FILE — read before wiring it up.
//
// Human pose models (MoveNet, BlazePose) do not detect quadrupeds. There is
// no drop-in equivalent for horses that ships with Expo, so this module
// defines the seam a horse pose model plugs into and everything downstream
// is written against that seam rather than against a specific model.
//
// `registerHorsePoseAdapter()` is unimplemented on purpose. Until an adapter
// is registered, `detectHorse()` returns null, the pipeline runs rider-only,
// and every horse-attributed fault is simply not emitted. Nothing breaks and
// nothing is silently faked — `horseAvailable()` is the honest signal, and
// the UI is expected to check it rather than show an empty horse report.
//
// WHY THE BENCHMARK MAKES THIS TRACTABLE
//
// Finding a horse's stifle in frame 400 of a run, motion-blurred and at an
// angle, is hard. Finding it on a still horse, from twelve angles, in good
// light, is much easier. The walk-around gives us the second problem, and
// `trackFromSeeds()` turns the first problem into the much cheaper one of
// following points we have already located. That is the real engineering
// value of the capture step, beyond the measurements it produces.

import type { HorseFrame, HorseBaseline, HorseMeasurements, PoseLandmark } from './types.ts';
import { HORSE, HORSE_LANDMARK_COUNT, angleFromHorizontal, distance, mean } from './landmarks.ts';

export interface HorsePoseAdapter {
  /** Identifier recorded on every measurement row for reproducibility. */
  readonly modelId: string;
  /** Detect the horse in one frame. Null when no horse is found. */
  detect(imageRef: unknown, timestampMs: number): Promise<HorseFrame | null>;
  /**
   * Optional fast path. Given known landmark positions from the previous
   * frame, follow them rather than detecting from scratch.
   */
  track?(
    imageRef: unknown,
    previous: HorseFrame,
    timestampMs: number,
  ): Promise<HorseFrame | null>;
}

let adapter: HorsePoseAdapter | null = null;

export function registerHorsePoseAdapter(next: HorsePoseAdapter): void {
  adapter = next;
}

export function horseAvailable(): boolean {
  return adapter !== null;
}

export function horseModelId(): string | null {
  return adapter?.modelId ?? null;
}

export async function detectHorse(
  imageRef: unknown,
  timestampMs: number,
): Promise<HorseFrame | null> {
  if (!adapter) return null;
  return adapter.detect(imageRef, timestampMs);
}

/**
 * Follow the horse through a run starting from the landmarks the benchmark
 * already located. Falls back to full detection when tracking loses the
 * horse, and reports how much of the run was tracked rather than detected so
 * confidence downstream can reflect it.
 */
export async function trackFromSeeds(
  frames: Array<{ imageRef: unknown; timestampMs: number }>,
  baseline: HorseBaseline | null,
): Promise<{ frames: HorseFrame[]; trackedRatio: number }> {
  if (!adapter) return { frames: [], trackedRatio: 0 };

  const out: HorseFrame[] = [];
  let previous: HorseFrame | null = seedFrame(baseline);
  let tracked = 0;

  for (const frame of frames) {
    let result: HorseFrame | null = null;

    if (previous && adapter.track) {
      result = await adapter.track(frame.imageRef, previous, frame.timestampMs);
      if (result) tracked++;
    }
    if (!result) {
      result = await adapter.detect(frame.imageRef, frame.timestampMs);
    }
    if (result) {
      out.push(result);
      previous = result;
    }
  }

  return {
    frames: out,
    trackedRatio: frames.length ? tracked / frames.length : 0,
  };
}

function seedFrame(baseline: HorseBaseline | null): HorseFrame | null {
  if (!baseline || !Object.keys(baseline.landmarkSeeds).length) return null;
  const landmarks: PoseLandmark[] = new Array(HORSE_LANDMARK_COUNT).fill(null).map(() => ({
    x: 0,
    y: 0,
    z: 0,
    visibility: 0,
  }));
  for (const [key, seed] of Object.entries(baseline.landmarkSeeds)) {
    const index = Number(key);
    if (!Number.isInteger(index) || index < 0 || index >= HORSE_LANDMARK_COUNT) continue;
    landmarks[index] = { x: seed.x, y: seed.y, z: 0, visibility: seed.confidence };
  }
  return { timestampMs: 0, landmarks };
}

// ---------------------------------------------------------------------------
// Conformation measurement
// ---------------------------------------------------------------------------

/**
 * Build the horse's resting measurements from the benchmark frames.
 *
 * Each measurement is taken from the frames where it is least foreshortened
 * rather than averaged across all of them: body length is only truthful from
 * the side, chest depth only from the side, and averaging a side view with a
 * three-quarter view produces a number that describes no real horse.
 */
export function measureHorseConformation(frames: HorseFrame[]): HorseMeasurements | null {
  if (frames.length < 4) return null;

  const usable = frames.filter((f) => f.landmarks.length >= HORSE_LANDMARK_COUNT);
  if (usable.length < 4) return null;

  const lateralFrames = mostLateral(usable, 0.35);
  if (!lateralFrames.length) return null;

  const bodyLengths: number[] = [];
  const withersHeights: number[] = [];
  const toplineLengths: number[] = [];
  const shoulderAngles: number[] = [];
  const hipAngles: number[] = [];
  const chestDepths: number[] = [];
  const cannonRatios: number[] = [];
  const levelnesses: number[] = [];

  for (const frame of lateralFrames) {
    const h = frame.landmarks;
    const shoulder = h[HORSE.POINT_OF_SHOULDER];
    const buttock = h[HORSE.POINT_OF_BUTTOCK];
    const withers = h[HORSE.WITHERS];
    const croup = h[HORSE.CROUP];
    const girthTop = h[HORSE.GIRTH_TOP];
    const girthBottom = h[HORSE.GIRTH_BOTTOM];
    const elbow = h[HORSE.ELBOW];
    const knee = h[HORSE.LEFT_KNEE];
    const fetlock = h[HORSE.LEFT_FRONT_FETLOCK];
    const hoof = h[HORSE.LEFT_FRONT_HOOF];
    const hip = h[HORSE.POINT_OF_HIP];
    const stifle = h[HORSE.STIFLE];

    if (!shoulder || !buttock || !withers || !girthBottom) continue;

    const bodyLength = distance(shoulder, buttock);
    if (bodyLength < 1e-6) continue;
    bodyLengths.push(bodyLength);

    if (hoof) withersHeights.push(Math.abs(hoof.y - withers.y) / bodyLength);
    if (croup) toplineLengths.push(distance(withers, croup) / bodyLength);
    if (girthTop) chestDepths.push(distance(girthTop, girthBottom) / bodyLength);
    if (croup) levelnesses.push((withers.y - croup.y) / bodyLength);
    if (elbow) shoulderAngles.push(Math.abs(angleFromHorizontal(shoulder, withers)));
    if (hip && stifle) hipAngles.push(Math.abs(angleFromHorizontal(hip, stifle)));
    if (knee && fetlock && elbow) {
      const cannon = distance(knee, fetlock);
      const forearm = distance(elbow, knee);
      if (forearm > 1e-6) cannonRatios.push(cannon / forearm);
    }
  }

  if (!bodyLengths.length) return null;

  return {
    withersHeight: mean(withersHeights),
    bodyLength: 1, // normalised reference
    toplineLength: mean(toplineLengths),
    shoulderAngle: mean(shoulderAngles),
    hipAngle: mean(hipAngles),
    chestDepth: mean(chestDepths),
    cannonToForearmRatio: mean(cannonRatios),
    levelness: mean(levelnesses),
  };
}

/**
 * Frames where the horse is closest to side-on, which is where linear
 * measurements are truthful. Ranked by apparent length over apparent height:
 * highest ratio is most lateral.
 */
function mostLateral(frames: HorseFrame[], keepFraction: number): HorseFrame[] {
  const scored = frames
    .map((frame) => {
      const h = frame.landmarks;
      const shoulder = h[HORSE.POINT_OF_SHOULDER];
      const buttock = h[HORSE.POINT_OF_BUTTOCK];
      const withers = h[HORSE.WITHERS];
      const girth = h[HORSE.GIRTH_BOTTOM];
      if (!shoulder || !buttock || !withers || !girth) return null;
      const height = distance(withers, girth);
      if (height < 1e-6) return null;
      return { frame, aspect: distance(shoulder, buttock) / height };
    })
    .filter(Boolean) as Array<{ frame: HorseFrame; aspect: number }>;

  if (!scored.length) return [];
  scored.sort((a, b) => b.aspect - a.aspect);
  const keep = Math.max(2, Math.floor(scored.length * keepFraction));
  return scored.slice(0, keep).map((s) => s.frame);
}

/**
 * Landmark seeds for the run tracker: the median position of each landmark
 * across the most lateral frames, with the agreement between frames recorded
 * as the seed's confidence.
 */
export function extractLandmarkSeeds(
  frames: HorseFrame[],
): Record<string, { x: number; y: number; confidence: number }> {
  const seeds: Record<string, { x: number; y: number; confidence: number }> = {};
  if (!frames.length) return seeds;

  const lateral = mostLateral(frames, 0.35);
  if (!lateral.length) return seeds;

  for (let index = 0; index < HORSE_LANDMARK_COUNT; index++) {
    const points = lateral
      .map((f) => f.landmarks[index])
      .filter((l): l is PoseLandmark => Boolean(l) && (l?.visibility ?? 0) > 0.3);
    if (points.length < 2) continue;

    const x = median(points.map((p) => p.x));
    const y = median(points.map((p) => p.y));
    const spread = mean(points.map((p) => Math.hypot(p.x - x, p.y - y)));
    seeds[String(index)] = {
      x,
      y,
      confidence: Math.max(0, Math.min(1, 1 - spread * 8)) * mean(points.map((p) => p.visibility)),
    };
  }
  return seeds;
}

function median(values: number[]): number {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[mid]! : (sorted[mid - 1]! + sorted[mid]!) / 2;
}
