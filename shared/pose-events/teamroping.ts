// src/lib/pose/event.ts — team roping
//
// Two contestants, two ends, and faults attributable to each. The two
// coaching outputs that actually change results are crossfire risk (measured
// against BOTH standards, because the class decides which applies) and
// handle quality, because most heelers miss because of the header's handle
// rather than their own throw.

import type { FaultDefinition } from './types.ts';
import type { Taxonomy } from './judge.ts';

export const FEATURE_KEYS = [
  'score_line_break_delta_ms',
  'header_swing_count',
  'header_delivery_frame_ms',
  'header_loop_travel_ms',
  'head_catch_type', // 0 horns, 1 half head, 2 neck, 3 illegal
  'turn_frame_ms', // where the header changes the steer's direction
  'steer_in_tow_frame_ms', // the crossfire reference
  'handle_quality', // steer trajectory smoothness after the turn
  'heeler_position_track', // lateral offset through the corner
  'heeler_delivery_frame_ms',
  'heel_loop_open_ms',
  'heel_loop_contact_frame_ms',
  'heel_catch_type', // 0 two feet, 1 one foot, 2 front foot
  'dally_frame_header_ms',
  'dally_frame_heeler_ms',
  'face_frame_ms',
  'total_run_ms',
  // Reported under BOTH standards. A run legal under one and illegal under
  // the other is exactly the case a roper needs shown to him.
  'crossfire_margin_release_ms',
  'crossfire_margin_contact_ms',
  'dally_thumb_exposure', // injury prevention, not performance
] as const;

export const SEGMENTS: string[] = [];

const DEFINITIONS: FaultDefinition[] = [
  {
    code: 'CROSSFIRE_RISK_RELEASE',
    label: 'Close to a crossfire (release standard)',
    description:
      'Under the USTRC standard the call is made on when you turn the loop loose, and you were close. In a class running that standard this is a no time.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'crossfire_margin_release_ms',
    thresholds: { low: 120, medium: 60, high: 10 },
    inverted: true,
    drill: 'Corner work with somebody calling the tow frame out loud so you learn where it actually is.',
  },
  {
    code: 'CROSSFIRE_RISK_CONTACT',
    label: 'Close to a crossfire (contact standard)',
    description:
      'Under the PRCA standard the call is made on when the loop makes contact, not when it leaves your hand. You were close on that measure too.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'crossfire_margin_contact_ms',
    thresholds: { low: 120, medium: 60, high: 10 },
    inverted: true,
    drill: 'Same corner work, but watch the contact frame rather than the delivery.',
  },
  {
    code: 'POOR_HANDLE',
    label: 'Rough handle',
    description:
      'The steer did not come around smooth. Most heelers miss because of the handle rather than their own throw, so this is the header’s number even though it shows up as a heeling problem.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'handle_quality',
    thresholds: { low: 0.2, medium: 0.35, high: 0.55 },
    inverted: true,
    drill: 'Head and handle without a heeler. Bring the steer around at a pace somebody could actually heel.',
  },
  {
    code: 'HEELER_POSITION_WIDE',
    label: 'Wide through the corner',
    description: 'Your lateral offset through the corner put you out of position before the throw was ever a factor.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'heeler_position_track',
    thresholds: { low: 0.12, medium: 0.22, high: 0.35 },
    drill: 'Track the corner without throwing until the position is automatic.',
  },
  {
    code: 'BARRIER_MARGIN_THIN',
    label: 'Cutting the barrier fine',
    description:
      'A barrier is five seconds under USTRC and ten under PRCA. Either way you were close enough that it is luck.',
    segment: 'whole_run',
    attributedTo: 'pair',
    feature: 'score_line_break_delta_ms',
    thresholds: { low: -80, medium: -40, high: -10 },
    inverted: true,
    drill: 'Score work against a marker.',
  },
  {
    code: 'DALLY_THUMB_EXPOSED',
    label: 'Thumb exposed on the dally',
    description:
      'Your hand position at the horn puts the thumb where it can be taken off. This is the one item on this list that is not about winning.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'dally_thumb_exposure',
    thresholds: { low: 0.3, medium: 0.5, high: 0.7 },
    drill: 'Slow dally practice with the thumb deliberately up, until it is muscle memory.',
  },
];

export const TAXONOMY: Taxonomy = {
  version: 'teamroping-1.0.0',
  definitions: DEFINITIONS,
  repeatedSegments: SEGMENTS,
};
