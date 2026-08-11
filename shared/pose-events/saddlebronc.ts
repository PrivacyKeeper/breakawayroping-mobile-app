// src/lib/pose/event.ts — saddle bronc
//
// The mark-out frame is the single highest-value frame in the sport: it
// decides whether the ride counts at all. Everything else here is about
// spurring rhythm, which riders lose points to being half a beat late on and
// cannot feel.
//
// Note that per-jump features are arrays in the raw capture and are reduced
// to summary numbers before judging — the taxonomy scores the pattern across
// the ride, not any single jump.

import type { FaultDefinition } from './types.ts';
import type { Taxonomy } from './judge.ts';

export const FEATURE_KEYS = [
  'chute_gate_frame_ms',
  'front_feet_ground_frame_ms', // the mark-out judgment moment
  'spur_position_at_markout', // both spurs above the shoulder point
  'markout_margin_deg', // how far above or below the point
  'rein_hand_height',
  'rein_length_effective',
  'body_angle_mean',
  'body_angle_variance',
  'spur_stroke_count',
  'spur_stroke_amplitude', // shoulder point to cantle sweep
  'spur_stroke_timing_error', // phase offset against the horse's rise
  'toe_turnout_angle_mean',
  'free_arm_amplitude',
  'free_arm_crossed_body',
  'seat_contact_ratio',
  'lift_rhythm_score',
  'horse_jump_count',
  'horse_direction_changes',
  'horse_drop_severity',
  'body_position_under_drop',
  'whistle_frame_ms',
  'dismount_frame_ms',
] as const;

export const SEGMENTS: string[] = [];

const DEFINITIONS: FaultDefinition[] = [
  {
    code: 'MARKOUT_MARGINAL',
    label: 'Marginal mark-out',
    description:
      'Your spurs were barely above the point of the shoulder when the front feet hit. Under PRCA a miss here is a no score outright, so this is the frame worth freezing and looking at.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'markout_margin_deg',
    thresholds: { low: 6, medium: 3, high: 1 },
    inverted: true,
    drill: 'Spur board work setting the feet and holding them, then chute practice with somebody watching the first jump only.',
  },
  {
    code: 'SPUR_TIMING_LATE',
    label: 'Half a beat late',
    description:
      'The phase offset between your spur stroke and the horse’s rise. Riders lose points here every jump and cannot feel it happening.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'spur_stroke_timing_error',
    thresholds: { low: 60, medium: 110, high: 180 },
    drill: 'Spur board with a metronome set to this horse’s jump cadence from bronc_patterns.',
  },
  {
    code: 'SPUR_AMPLITUDE_SHORT',
    label: 'Short stroke',
    description:
      'How far the spur stroke actually travels, versus what it feels like. Almost always shorter than the rider thinks.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'spur_stroke_amplitude',
    thresholds: { low: 0.1, medium: 0.2, high: 0.32 },
    inverted: true,
    drill: 'Spur board with a target at the cantle. Reach it every stroke or the rep does not count.',
  },
  {
    code: 'POSITION_UNDER_DROP',
    label: 'Shoulders forward on the drop',
    description:
      'Where your shoulders were when the horse dropped. This is the most common cause of getting bucked off in front.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'body_position_under_drop',
    thresholds: { low: 8, medium: 15, high: 25 },
    drill: 'Bucking machine work on the drop specifically, with the shoulders held back.',
  },
  {
    code: 'FREE_ARM_CROSSING',
    label: 'Free arm crossing the body',
    description: 'The free arm came across you. It costs marks and it is a step away from touching.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'free_arm_crossed_body',
    thresholds: { low: 0.2, medium: 0.4, high: 0.6 },
    drill: 'Bucking machine with the free arm deliberately high and out.',
  },
  {
    code: 'INCONSISTENT_BODY_ANGLE',
    label: 'Position varying jump to jump',
    description: 'Your body angle moved around across the eight seconds. Consistency marks better than one good jump.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'body_angle_variance',
    thresholds: { low: 7, medium: 13, high: 20 },
    drill: 'Film all eight seconds and watch the jumps side by side rather than as one ride.',
  },
];

export const TAXONOMY: Taxonomy = {
  version: 'saddlebronc-1.0.0',
  definitions: DEFINITIONS,
  repeatedSegments: SEGMENTS,
};
