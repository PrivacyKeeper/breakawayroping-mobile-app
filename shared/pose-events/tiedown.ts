// src/lib/pose/event.ts — tie-down roping
//
// Four separate skills chained with no margin: score the barrier, catch,
// dismount and get down the rope, flank and tie. The horse does roughly half
// the work. So unlike every other event here, the analysis is segmented —
// a roper does not want to know he was 8.4, he wants to know which of the
// four segments cost him.

import type { FaultDefinition } from './types.ts';
import type { Taxonomy } from './judge.ts';

export const FEATURE_KEYS = [
  'barrier_break_delta_ms',
  'box_start_frame_ms',
  'horse_acceleration_profile',
  'approach_line_deviation',
  'swing_count',
  'delivery_frame_ms',
  'loop_travel_ms',
  'catch_frame_ms',
  'horse_stop_frame_ms',
  'slack_pull_frame_ms',
  'dismount_frame_ms',
  'ground_contact_frame_ms',
  'down_the_rope_ms',
  'calf_reach_frame_ms',
  'flank_technique_class', // 0 leg grab, 1 flank strap, 2 side
  'flank_to_flat_ms',
  'string_on_frame_ms',
  'wraps_count',
  'hooey_frame_ms',
  'hands_up_frame_ms',
  'tie_duration_ms',
  'remount_ms',
  'rope_tension_proxy', // horse holding the rope through the tie
  'jerk_down_risk', // calf trajectory when the rope comes tight
] as const;

export const SEGMENTS: string[] = [];

const DEFINITIONS: FaultDefinition[] = [
  {
    code: 'BARRIER_MARGIN_THIN',
    label: 'Cutting the barrier fine',
    description: 'Leaving close enough to the barrier that ten seconds is a matter of luck.',
    segment: 'whole_run',
    attributedTo: 'pair',
    feature: 'barrier_break_delta_ms',
    thresholds: { low: -80, medium: -40, high: -10 },
    inverted: true,
    drill: 'Score work against a marker with your margin called out loud.',
  },
  {
    code: 'DISMOUNT_SLOW',
    label: 'Slow off the horse',
    description:
      'Catch to feet on the ground. Ropers give up two or three tenths here without ever knowing it.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'dismount_frame_ms',
    thresholds: { low: 120, medium: 240, high: 400 },
    drill: 'Dismount drills off a standing horse, then at a trot, before you add a calf.',
  },
  {
    code: 'TIE_SLOW',
    label: 'Slow tie',
    description:
      'String on to hands up. The most trainable segment in the run and the easiest one to measure.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'tie_duration_ms',
    thresholds: { low: 300, medium: 600, high: 1000 },
    drill: 'Ground work on a dummy with a timer. Wraps and hooey, nothing else, until the number moves.',
  },
  {
    code: 'HORSE_NOT_WORKING_ROPE',
    label: 'Horse not working the rope',
    description:
      'The rope went slack through the tie. A horse that steps up and keeps it tight is doing half your job.',
    segment: 'whole_run',
    attributedTo: 'horse',
    feature: 'rope_tension_proxy',
    thresholds: { low: 0.15, medium: 0.3, high: 0.5 },
    inverted: true,
    drill: 'Rope work on the ground with somebody on the rope, teaching the horse to hold and give.',
  },
  {
    code: 'HORSE_STOP_LATE',
    label: 'Late stop',
    description: 'The stop came after the catch rather than with it, which puts you further down the rope.',
    segment: 'whole_run',
    attributedTo: 'horse',
    feature: 'horse_stop_frame_ms',
    thresholds: { low: 150, medium: 300, high: 500 },
    drill: 'Stop maintenance off the pattern. Do not school the stop with a calf in front of you.',
  },
  {
    code: 'JERK_DOWN_RISK',
    label: 'Close to a jerk-down',
    description:
      'The calf came close to being jerked off all four feet. That is a no time where it is enforced, and it is a welfare issue everywhere. Worth changing before it costs you.',
    segment: 'whole_run',
    attributedTo: 'pair',
    feature: 'jerk_down_risk',
    thresholds: { low: 0.4, medium: 0.6, high: 0.8 },
    drill: 'Slack management work — let the horse take the shock rather than the calf.',
  },
];

export const TAXONOMY: Taxonomy = {
  version: 'tiedown-1.0.0',
  definitions: DEFINITIONS,
  repeatedSegments: SEGMENTS,
};
