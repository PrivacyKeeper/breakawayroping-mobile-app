// src/lib/pose/event.ts — steer wrestling
//
// Going too early is the number one fault in the event and it is invisible
// from the ground. The hazer overlay below is the first objective measurement
// of hazing quality anyone has produced, which matters because the hazer is
// owed a share of the cheque and currently has nothing but opinion to
// argue with.

import type { FaultDefinition } from './types.ts';
import type { Taxonomy } from './judge.ts';

export const FEATURE_KEYS = [
  'barrier_break_delta_ms',
  'box_start_frame_ms',
  'horse_acceleration_profile',
  'closing_rate', // relative velocity to the steer
  'position_at_dismount', // lateral and longitudinal offset
  'dismount_frame_ms',
  'hand_on_horn_frame_ms',
  'feet_contact_frame_ms',
  'heel_plant_angle',
  'steer_deceleration_curve',
  'leverage_application_frame_ms',
  'throw_technique_class', // 0 classic, 1 wing, 2 sling, 3 rollover
  'fall_complete_frame_ms',
  'head_direction_at_fall', // legal fall verification
  'hazer_line_deviation', // how straight the steer was kept
  'shoulder_angle_at_contact', // injury proxy
  'neck_position_at_fall', // injury proxy
  'total_run_ms',
] as const;

export const SEGMENTS: string[] = [];

const DEFINITIONS: FaultDefinition[] = [
  {
    code: 'DISMOUNT_EARLY',
    label: 'Going too early',
    description:
      'You left the horse before the closing rate justified it. This is the number one fault in the event and you cannot see it from the ground.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'position_at_dismount',
    thresholds: { low: 0.12, medium: 0.22, high: 0.35 },
    drill: 'Run steers without throwing, getting the hands on and letting them go, until the timing settles.',
  },
  {
    code: 'HEEL_PLANT_POOR',
    label: 'Heels not planted',
    description:
      'Your heel plant angle and body position at contact were off. This is the difference between a 3.8 and a 6.2 and nothing else in the run makes it back.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'heel_plant_angle',
    thresholds: { low: 8, medium: 16, high: 26 },
    drill: 'Dummy work on the drop — heels down and under you before you ask the steer for anything.',
  },
  {
    code: 'HAZER_LINE_POOR',
    label: 'Steer not kept straight',
    description:
      'The steer drifted off the line. Quantified here rather than argued about after — and worth showing your hazer, not just reading yourself.',
    segment: 'whole_run',
    attributedTo: 'pair',
    feature: 'hazer_line_deviation',
    thresholds: { low: 0.15, medium: 0.28, high: 0.45 },
    drill: 'Run the same hazer repeatedly and watch this number rather than trading opinions about it.',
  },
  {
    code: 'BARRIER_MARGIN_THIN',
    label: 'Cutting the barrier fine',
    description: 'Ten seconds is a long way to come back from. You were close.',
    segment: 'whole_run',
    attributedTo: 'pair',
    feature: 'barrier_break_delta_ms',
    thresholds: { low: -80, medium: -40, high: -10 },
    inverted: true,
    drill: 'Score work against a marker.',
  },
  {
    code: 'SHOULDER_LOAD_HIGH',
    label: 'Shoulder loaded outside the usual range',
    description:
      'Your shoulder angle at horn contact was outside where it normally sits. This is information about how you are landing, not a medical assessment — if something hurts, see a professional.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'shoulder_angle_at_contact',
    thresholds: { low: 10, medium: 20, high: 32 },
    drill: 'Posterior chain and landing mechanics work. Prehab is cheaper than surgery.',
  },
];

export const TAXONOMY: Taxonomy = {
  version: 'steerwrestling-1.0.0',
  definitions: DEFINITIONS,
  repeatedSegments: SEGMENTS,
};
