---
name: rodeo-brand
description: BreakawayRoping.pro visual identity — the crest palette, tokens, and how colour is applied across the website and the mobile app. Use when styling a page or screen, picking colours, adding Tailwind theme tokens, editing globals.css, building a theme file, or making anything look on-brand.
---

# Brand

**The palette comes from the crest, not from the build map.** The build map said
"hot coral and gold on charcoal plum". The real logo won; that decision is
final and already shipped on the website.

## Tokens

| Token | Value | Use |
| --- | --- | --- |
| `--ink` | `#070c15` | page background, near-black navy |
| `--ink-raised` | `#0f1a2b` | raised surface |
| `--ink-panel` | `#142236` | cards, panels |
| `--ink-border` | `#23374f` | borders, dividers |
| `--blue` | `#2eb3ec` | electric blue, primary accent |
| `--blue-deep` | `#1b7fb8` | pressed / deeper accent |
| `--gold` | `#d4af37` | rope gold, calls to action |
| `--gold-hover` | `#e8c65a` | gold hover |
| `--cream` | `#f2e8d5` | body text on ink |
| `--muted` | `#8fa3bf` | secondary text |
| `--muted-dim` | `#5f7391` | tertiary text |

Type is **Inter**, loaded through `next/font/google` as `--font-inter`.

## Website

Defined in `src/app/globals.css`: raw values on `:root`, exposed to Tailwind v4
through `@theme inline` as `--color-*`. Style with the token classes
(`bg-ink-panel`, `text-cream`, `border-ink-border`, `text-gold`) — **do not
write hex literals or stock Tailwind palette classes** (`bg-slate-900`,
`text-yellow-400`) in components. If a shade is missing, add a token.

The arena backdrop is the `.arena-page` class: a fixed, softened image behind
the content with a gradient wash. It switches on when
`public/backgrounds/arena-1.jpg` / `arena-2.jpg` exist and stays invisible when
they do not, which is the current state.

## Mobile

The Expo app is not scaffolded yet. When it is, the brand theme is the same
eleven tokens in one theme module, named identically, so a colour can be
matched between web and app by name. Do not re-derive a second palette.

## Missing assets

`public/logo.png` and `public/cross.jpg` are referenced by the site and the
OG tags but are **not in the repo** — they render as broken image boxes today.
That is a known gap waiting on the owner, not a bug to work around by removing
the references.
