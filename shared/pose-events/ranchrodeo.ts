// src/lib/pose/event.ts — ranch rodeo
//
// The analysis targets here are team efficiency, not individual technique.
// That is a genuine difference from every other app in the portfolio: the
// question is not "what is wrong with your form" but "where did four people
// lose seconds waiting on each other".
//
// It is also the only event where a large share of what the camera can see is
// PENALTY DETECTION rather than coaching — loping in the herd, a rider in the
// herd out of turn, a horse in the judge's circle. Those are surfaced as
// observations for the team to check against the flag, never as an official
// call. The judge on the ground is the authority and the app says so.

import type { FaultDefinition } from './types.ts';
import type { Taxonomy } from './judge.ts';

export const FEATURE_KEYS = [
  // Team branding
  'branding_line_cross_spread_ms', // gap between first and last roper crossing
  'branding_loops_per_roper',
  'branding_drag_duration_ms',
  'branding_gait_violation_score', // loping detection, penalty observation
  'branding_flanker_early_score', // contact before the calf fully crossed
  'branding_iron_cycle_ms',
  // Number sorting
  'sorting_riders_in_herd_max',
  'sorting_gait_violation_score',
  'sorting_cut_interval_mean_ms',
  'sorting_hold_line_integrity',
  'sorting_herd_pressure_proxy',
  // Wild cow milking
  'milking_rope_off_horn_to_milk_ms',
  'milking_cow_standing_ratio',
  'milking_runner_circle_entry_mode', // 0 on foot, 1 horseback (penalty)
  'milking_mugger_engagement_ms',
  // Stray gathering
  'gathering_head_to_heel_ms',
  'gathering_tie_duration_ms',
  'gathering_six_second_hold_ok',
  // Ranch bronc
  'bronc_exposure_proxy', // riding versus hanging on
  'bronc_control_proxy', // body angle stability
  'bronc_aggression_proxy', // free arm and leg amplitude
  'bronc_night_latch_used',
  // Across the card
  'dead_time_total_ms', // where the team lost seconds waiting on each other
  'role_idle_variance', // how unevenly the work was shared
] as const;

/** Each compulsory event is a segment the whole-card faults repeat over. */
export const SEGMENTS: string[] = [
  'team_branding',
  'number_sorting',
  'wild_cow_milking',
  'stray_gathering',
  'ranch_bronc',
];

const DEFINITIONS: FaultDefinition[] = [
  {
    code: 'DEAD_TIME_HIGH',
    label: 'Waiting on each other',
    description:
      'Seconds where nobody was doing anything useful. This is almost always the cheapest time on the card to get back, and it is invisible from inside the run.',
    segment: 'whole_run',
    attributedTo: 'pair',
    feature: 'dead_time_total_ms',
    thresholds: { low: 2000, medium: 5000, high: 9000 },
    drill: 'Walk the card on foot and talk through who moves when. Most of this is choreography, not horsemanship.',
  },
  {
    code: 'ROLE_LOAD_UNEVEN',
    label: 'Work shared unevenly',
    description:
      'One or two of you did most of it while somebody stood. Not a criticism of anybody — usually it means the roles were not assigned before the flag.',
    segment: 'whole_run',
    attributedTo: 'pair',
    feature: 'role_idle_variance',
    thresholds: { low: 0.2, medium: 0.35, high: 0.5 },
    drill: 'Assign a role per event in the roster before you get there, not in the box.',
  },
  {
    code: 'LINE_CROSS_SPREAD',
    label: 'Ragged start',
    description:
      'A wide gap between the first and last of you crossing the line. Ropers are meant to start together and the clock does not wait.',
    segment: 'whole_run',
    attributedTo: 'pair',
    feature: 'branding_line_cross_spread_ms',
    thresholds: { low: 500, medium: 1200, high: 2200 },
    drill: 'Practise the start alone. Cross together, every time.',
  },
  {
    code: 'GAIT_VIOLATION_OBSERVED',
    label: 'Possible loping in the herd',
    description:
      'The video suggests a gait faster than a trot in the herd, which is a 30 second penalty. This is an observation to check against the flag — the judge on the ground made the call, not this app.',
    segment: 'whole_run',
    attributedTo: 'pair',
    feature: 'sorting_gait_violation_score',
    thresholds: { low: 0.3, medium: 0.5, high: 0.7 },
    drill: 'Work the herd at a walk in practice until slow feels normal at speed.',
  },
  {
    code: 'MULTIPLE_IN_HERD_OBSERVED',
    label: 'Possible second rider in the herd',
    description:
      'More than one rider appears to have been in the herd at once, which is a 30 second penalty. Again — an observation, not a call.',
    segment: 'whole_run',
    attributedTo: 'pair',
    feature: 'sorting_riders_in_herd_max',
    thresholds: { low: 1.5, medium: 2, high: 3 },
    drill: 'One in, three holding. Decide who cuts before you cross the line.',
  },
  {
    code: 'MILKING_SEQUENCE_SLOW',
    label: 'Slow from rope off to milk',
    description:
      'The gap between the rope coming off the horn and milking starting. The rope has to be off before you milk, so this segment is pure lost time.',
    segment: 'whole_run',
    attributedTo: 'pair',
    feature: 'milking_rope_off_horn_to_milk_ms',
    thresholds: { low: 1500, medium: 3000, high: 5000 },
    drill: 'Practise the handoff specifically — roper off, muggers set, milker in, in that order.',
  },
  {
    code: 'BRONC_LOW_EXPOSURE',
    label: 'Riding safe',
    description:
      'Ranch bronc marks aggressiveness, control and exposure. You rode to stay on rather than to mark, which is understandable and is also where the points are.',
    segment: 'whole_run',
    attributedTo: 'rider',
    feature: 'bronc_exposure_proxy',
    thresholds: { low: 0.15, medium: 0.3, high: 0.45 },
    inverted: true,
    drill: 'Machine work with a free arm target. Exposure is trainable; nerve is not the only variable.',
  },
];

export const TAXONOMY: Taxonomy = {
  version: 'ranchrodeo-1.0.0',
  definitions: DEFINITIONS,
  repeatedSegments: [],
};
