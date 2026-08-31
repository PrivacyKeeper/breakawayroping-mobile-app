// src/lib/pose/event.ts — breakaway roping
//
// The shortest run in rodeo. Everything that decides it happens between the
// barrier and the flag, and most of it is over in under a second: how the mare
// leaves, when the loop goes, and whether the roper's body is still square
// when it does.
//
// So the fault list here is deliberately short and heavily weighted toward the
// box and the delivery. There is no dismount, no tie, and no second half of
// the run to make time up in — which is why a tenth given away in the corner
// is the whole event rather than something to fix later.

import type { FaultDefinition } from './types.ts';
import type { Taxonomy } from './judge.ts';

export const FEATURE_KEYS = [
  'barrier_break_delta_ms',
  'box_start_frame_ms',
  'horse_acceleration_profile',
  'approach_line_deviation',
  'swing_count',
  'delivery_frame_ms',
  'rope_hand_height_delta',
  'shoulder_square_at_delivery',
  'torso_lean_at_delivery',
  'loop_travel_ms',
  'loop_shape_ratio',
  'catch_frame_ms',
  'draw_tight_ms',
  'breakaway_frame_ms',
  'horse_rate_after_catch',
  'rein_hand_stability',
] as const;

// One throw, so there is nothing to repeat a per-segment fault against.
export const SEGMENTS: string[] = [];

const DEFINITIONS: FaultDefinition[] = [
  {
    code: 'BARRIER_MARGIN_THIN',
    label: 'Cutting the barrier fine',
    description:
      'Leaving close enough to the barrier that ten seconds is a matter of luck. In an event won by hundredths, one barrier is the whole weekend.',
    segment: 'whole_run',
    attributedTo: 'pair',
    feature: 'barrier_break_delta_ms',
    thresholds: { low: -80, medium: -40, high: -10 },
    inverted: true,
    drill: 'Score work against a marker with your margin called out loud.',
  },
  {
    code: 'SLOW_OUT_OF_THE_BOX',
    label: 'Slow leaving the box',
    description:
      'The mare is not gathered when the barrier drops. This is the cheapest tenth in the event to get back and the one most ropers never measure.',
    segment: 'whole_run',
    attributedTo: 'horse',
    feature: 'box_start_frame_ms',
    thresholds: { low: 120, medium: 200, high: 320 },
    drill: 'Standing starts, no rope, until she leaves flat every time.',
  },
  {
    code: 'DELIVERY_LATE',
    label: 'Holding the loop too long',
    description:
      'Extra swings past the point the shot was there. Almost always a confidence habit rather than a position problem.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'delivery_frame_ms',
    thresholds: { low: 150, medium: 300, high: 500 },
    drill: 'Two-swing rule on the dummy, then on slow cattle.',
  },
  {
    code: 'SHOULDERS_OPEN_AT_DELIVERY',
    label: 'Shoulders opening as you throw',
    description:
      'The rope hand goes but the body turns with it, so the loop leaves off line. Measured against your own square position from the walk-around, not a textbook one.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'shoulder_square_at_delivery',
    thresholds: { low: 0.15, medium: 0.3, high: 0.45 },
    drill: 'Slow-motion delivery against a mirror or a phone on a fence post.',
  },
  {
    code: 'LOOP_COLLAPSING',
    label: 'Loop losing its shape',
    description:
      'The loop is flattening before it reaches the neck, which turns a catch into a slip.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'loop_shape_ratio',
    thresholds: { low: 0.2, medium: 0.35, high: 0.5 },
    drill: 'Dummy work concentrating on the tip, not the speed.',
  },
  {
    code: 'REACHING',
    label: 'Reaching for the catch',
    description:
      'Throwing from further back than your own delivery position, which costs accuracy for a distance you did not need.',
    segment: 'whole_run',
    attributedTo: 'pair',
    feature: 'approach_line_deviation',
    thresholds: { low: 0.2, medium: 0.35, high: 0.55 },
    drill: 'Ride two more strides before you throw, on slow cattle, until it is boring.',
  },
  {
    code: 'SLOW_DRAW_TIGHT',
    label: 'Slow to draw tight',
    description:
      'Catch to flag. The clock is still running while the slack comes out, and this is where a good catch becomes an average time.',
    segment: 'whole_run',
    attributedTo: 'pair',
    feature: 'draw_tight_ms',
    thresholds: { low: 120, medium: 220, high: 350 },
    drill: 'Rate work — the mare has to come back the moment the rope is on.',
  },
  {
    code: 'HORSE_NOT_RATING',
    label: 'Horse not rating after the catch',
    description:
      'She runs past the calf instead of coming back, so the rope never comes tight cleanly.',
    segment: 'whole_run',
    attributedTo: 'horse',
    feature: 'horse_rate_after_catch',
    thresholds: { low: 0.2, medium: 0.35, high: 0.5 },
    drill: 'Tracking without roping, asking for the stop every time.',
  },
];

export const TAXONOMY: Taxonomy = {
  version: 'breakaway-1.0.0',
  definitions: DEFINITIONS,
  repeatedSegments: SEGMENTS,
};
