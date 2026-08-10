// src/lib/pose/event.ts — breakaway roping
//
// The feature vector and fault taxonomy for this event. The shared engine in
// ./judge.ts does the judging; everything specific to breakaway is data here.
//
// A breakaway run is two to three seconds long and is barrier timing plus one
// throw. Very few variables, each one enormous — which makes this the most
// tractable analysis target in the portfolio and the most valuable, because
// ropers lose more money to the ten second barrier penalty than to bad throws.

import type { FaultDefinition } from './types.ts';
import type { Taxonomy } from './judge.ts';

/**
 * Feature keys emitted for a breakaway run. Every value is either a
 * millisecond offset from the barrier flag or a deviation from the roper's
 * own benchmark — never an absolute pose angle, which describes a photograph
 * rather than a roper.
 */
export const FEATURE_KEYS = [
  'barrier_break_delta_ms', // margin against the barrier. Negative is early.
  'horse_start_acceleration', // first three strides
  'approach_line_deviation', // lateral drift toward the calf
  'swing_count',
  'swing_plane_angle',
  'delivery_frame_ms',
  'delivery_hand_height',
  'loop_size_at_delivery',
  'loop_travel_ms', // delivery to neck
  'loop_shape_at_calf', // 0 open, 1 collapsed or tipped
  'catch_frame_ms',
  'slack_management_ms', // catch to horse stop
  'horse_stop_frame_ms',
  'string_break_frame_ms',
  'total_run_ms',
  'delivery_consistency', // variance across the season, not within a run
] as const;

/** One throw, so there is nothing to repeat a per-segment fault across. */
export const SEGMENTS: string[] = [];

const DEFINITIONS: FaultDefinition[] = [
  {
    code: 'BARRIER_MARGIN_THIN',
    label: 'Cutting the barrier fine',
    description:
      'You are leaving close enough to the barrier that a ten second penalty is a matter of luck. Over a season this costs more than bad throws do.',
    segment: 'whole_run',
    attributedTo: 'pair',
    feature: 'barrier_break_delta_ms',
    thresholds: { low: -80, medium: -40, high: -10 },
    inverted: true,
    drill: 'Score work in the box against a marker, with somebody calling your margin out loud so you learn what it feels like.',
  },
  {
    code: 'DELIVERY_INCONSISTENT',
    label: 'Inconsistent delivery',
    description:
      'Where you turn loose relative to the calf varies run to run. Variance in the delivery frame is the single best predictor of catch percentage there is.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'delivery_consistency',
    thresholds: { low: 60, medium: 110, high: 180 },
    drill: 'Dummy work at one fixed distance until the delivery point stops moving, then add the horse back.',
  },
  {
    code: 'LOOP_COLLAPSING',
    label: 'Loop tipping or collapsing',
    description:
      'The loop is not open when it gets to the calf. Front leg catches almost always come from this, and it is visible in the frame before the catch.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'loop_shape_at_calf',
    thresholds: { low: 0.3, medium: 0.5, high: 0.7 },
    drill: 'Slow swing work watching the loop plane. Build it a size bigger than feels right and let it settle.',
  },
  {
    code: 'SLACK_SLOW',
    label: 'Slow to the slack',
    description:
      'Time between the catch and the string breaking. Invisible to you, completely visible to the camera, and it is time on the clock.',
    segment: 'whole_run',
    attributedTo: 'pair',
    feature: 'slack_management_ms',
    thresholds: { low: 120, medium: 250, high: 420 },
    drill: 'Catch and stop, over and over, off the pattern. The catch is not the end of the run.',
  },
  {
    code: 'APPROACH_DRIFT',
    label: 'Drifting approach',
    description: 'Your line to the calf wandered rather than running straight at your throwing spot.',
    segment: 'whole_run',
    attributedTo: 'pair',
    feature: 'approach_line_deviation',
    thresholds: { low: 0.12, medium: 0.22, high: 0.35 },
    drill: 'Ride the line without throwing. Straight to the spot, every time, before you add the rope back.',
  },
  {
    code: 'HORSE_SLOW_OUT',
    label: 'Slow out of the box',
    description:
      'The first three strides are down on where this horse usually is. Worth checking the box work before you assume it is the throw.',
    segment: 'whole_run',
    attributedTo: 'horse',
    feature: 'horse_start_acceleration',
    thresholds: { low: 0.1, medium: 0.2, high: 0.35 },
    inverted: true,
    drill: 'Box work with no roping at all — in, stand, leave, repeat, until leaving is quiet and honest.',
  },
];

export const TAXONOMY: Taxonomy = {
  version: 'breakaway-1.0.0',
  definitions: DEFINITIONS,
  repeatedSegments: SEGMENTS,
};
