// src/constants/theme.ts
//
// Read from the live breakawayroping.pro stylesheet rather than from the spine
// document. Where the two disagree the shipped site wins: a user opening
// the app straight off the website should not feel a colour change.

export const colors = {
  background: '#070c15',
  surface: '#0d1523',
  card: '#111c2e',
  border: '#23374f',
  text: '#c8d4e4',
  muted: '#8fa3bf',
  accent: '#d4af37',
  accentAlt: '#2eb3ec',
  cream: '#f2e8d5',
  success: '#4ba36b',
  warning: '#d99a2b',
  danger: '#c8503f',
} as const;

export const app = {
  name: "Breakaway Roping",
  short: "Breakaway",
  domain: "breakawayroping.pro",
  eventType: "breakaway",
  eventLabel: "Breakaway roping",
  tagline: "The system of record for breakaway.",
  associations: ["WPRA","PRCA","NLBRA","NHSRA","NIRA"] as readonly string[],
} as const;

// Spacing follows the house rule from the BarrelConnect cursor rules:
// screens px-5 py-6 gap-y-6, cards p-4 rounded-2xl gap-y-2.
export const spacing = { screenX: 20, screenY: 24, gap: 24, cardPad: 16 } as const;
export const radius = { card: 16, pill: 999, control: 12 } as const;
