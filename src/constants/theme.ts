// src/constants/theme.ts
//
// Palette comes from the crest, not from the build map. STATUS.md records the
// decision and the reason: the map called for "hot coral and gold on charcoal
// plum" and the real logo won. Electric blue, rope gold and cream on a
// near-black navy.

export const colors = {
  background: '#070c15',
  surface: '#101826',
  card: '#16202f',
  border: '#2a3648',
  text: '#f2e8d5',
  muted: '#9aa7ba',
  accent: '#2eb3ec',
  accentAlt: '#d4af37',
  cream: '#f2e8d5',
  success: '#4ba36b',
  warning: '#d4af37',
  danger: '#c8503f',
} as const;

export const app = {
  name: "Breakaway Roping",
  short: "Breakaway",
  domain: "breakawayroping.pro",
  eventType: "breakaway",
  /**
   * The event_type codes this app covers, EXACTLY as they appear in the
   * `reference_options` table.
   *
   * Deliberately separate from `eventType` above, which is the app's own slug
   * and does not match the database ("breakaway" vs "breakaway_roping").
   * Reusing the slug as a filter silently matches nothing: the query succeeds,
   * the screen says the producer is not running this event, and there is no
   * error anywhere to notice.
   *
   * `jr_breakaway` is included because a junior roper's entries are still
   * theirs, and a 13-year-old who could not see her own draw would be the
   * whole point of this app missing.
   */
  eventCodes: ["breakaway_roping", "jr_breakaway"] as readonly string[],
  eventLabel: "Breakaway roping",
  tagline: "The fastest event in rodeo, measured against your own body.",
  associations: ["WPRA","NHSRA","NJHRA","NLBRA","NIRA","PRCA"] as readonly string[],
} as const;

// Spacing follows the house rule from the BarrelConnect cursor rules:
// screens px-5 py-6 gap-y-6, cards p-4 rounded-2xl gap-y-2.
export const spacing = { screenX: 20, screenY: 24, gap: 24, cardPad: 16 } as const;
export const radius = { card: 16, pill: 999, control: 12 } as const;
