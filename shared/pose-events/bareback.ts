// src/lib/pose/event.ts — bareback riding
//
// Lick completeness is the single number judges are actually rewarding, and
// no rider can count it himself. Knee lift fading in the last three jumps is
// the second — riders fade and cannot feel it happening.
//
// This app also carries the heaviest health weighting in the portfolio. The
// load and risk features below are recorded as information about how a career
// is accumulating wear, and are stated as such everywhere they surface. They
// are never a medical assessment and the app must never generate anything
// resembling "cleared to ride".

import type { FaultDefinition } from './types.ts';
import type { Taxonomy } from './judge.ts';

export const FEATURE_KEYS = [
  'chute_gate_frame_ms',
  'front_feet_ground_frame_ms',
  'spur_position_at_markout',
  'markout_margin_deg',
  'rigging_hand_position',
  'free_arm_amplitude',
  'free_arm_crossed_body',
  'knee_lift_amplitude_mean',
  'knee_lift_amplitude_fade', // drop across the last three jumps
  'spur_roll_start_timing',
  'leg_extension_timing',
  'spur_return_above_point_ratio',
  'toe_turnout_angle_mean',
  'stroke_continuity_score', // the lick: share of jumps with a complete stroke
  'body_angle_mean', // lay-back through each jump
  'body_angle_variance',
  'hip_hinge_range',
  'elbow_angle_peak', // load on the rigging arm, injury proxy
  'neck_position_at_impact', // whiplash proxy
  'horse_jump_count',
  'horse_jump_frequency_hz',
  'horse_direction_changes',
  'whistle_frame_ms',
] as const;

export const SEGMENTS: string[] = [];

const DEFINITIONS: FaultDefinition[] = [
  {
    code: 'LICK_INCOMPLETE',
    label: 'Incomplete lick',
    description:
      'The share of jumps where the spur stroke finished and the spurs got back over the point of the shoulder. This is the number judges are actually marking and you cannot count it from up there.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'stroke_continuity_score',
    thresholds: { low: 0.15, medium: 0.3, high: 0.45 },
    inverted: true,
    drill: 'Spur board with a continuity target — count completed strokes, not attempted ones.',
  },
  {
    code: 'KNEE_LIFT_FADING',
    label: 'Fading in the last three jumps',
    description:
      'Your knee lift dropped off at the end of the ride. Every rider does this and none of them can feel it.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'knee_lift_amplitude_fade',
    thresholds: { low: 0.12, medium: 0.22, high: 0.35 },
    drill: 'Bucking machine to ten seconds rather than eight, so eight stops being the edge of your gas.',
  },
  {
    code: 'MARKOUT_MARGINAL',
    label: 'Marginal mark-out',
    description:
      'Both spurs barely cleared the point of the shoulder when the front feet hit. Under PRCA a miss is a no score.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'markout_margin_deg',
    thresholds: { low: 6, medium: 3, high: 1 },
    inverted: true,
    drill: 'Chute practice on the first jump alone, with somebody watching the feet.',
  },
  {
    code: 'LAYBACK_INCONSISTENT',
    label: 'Lay-back varying through the drop',
    description: 'Your body angle moved around jump to jump, particularly through the drop.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'body_angle_variance',
    thresholds: { low: 7, medium: 13, high: 20 },
    drill: 'Bucking machine with a fixed lay-back target and no chasing the horse.',
  },
  {
    code: 'FREE_ARM_CROSSING',
    label: 'Free arm crossing the body',
    description: 'The free arm came across you — marks lost, and a touch away from a no score.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'free_arm_crossed_body',
    thresholds: { low: 0.2, medium: 0.4, high: 0.6 },
    drill: 'Machine work with the free arm held high and deliberately out.',
  },
  {
    code: 'ELBOW_LOAD_HIGH',
    label: 'Rigging arm loaded outside your usual range',
    description:
      'Elbow angle at peak extension was outside where it normally sits for you. Over a season this is the most valuable data you can own about your own longevity. Information, not a medical assessment — if it hurts, see a professional.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'elbow_angle_peak',
    thresholds: { low: 10, medium: 18, high: 28 },
    drill: 'Grip and forearm work, and look honestly at how many you have ridden this month.',
  },
  {
    code: 'NECK_POSITION_RISK',
    label: 'Neck position at impact',
    description:
      'Your neck position through the jumps was outside your usual range. Neck strengthening is directly protective in this event. Information, not medical advice.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'neck_position_at_impact',
    thresholds: { low: 10, medium: 18, high: 28 },
    drill: 'Neck strengthening. Unglamorous, protective, and it is the one thing in this list that is about riding at forty.',
  },
];

export const TAXONOMY: Taxonomy = {
  version: 'bareback-1.0.0',
  definitions: DEFINITIONS,
  repeatedSegments: SEGMENTS,
};
