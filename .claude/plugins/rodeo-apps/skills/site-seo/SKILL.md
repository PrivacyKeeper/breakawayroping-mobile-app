---
name: site-seo
description: Structure and SEO conventions for the BreakawayRoping.pro marketing site — adding or editing a page or blog post, metadata, canonical URLs, Open Graph, JSON-LD schema, sitemap.ts, robots.ts, or the Resend waitlist route. Use for any work inside breakawayroping-website/src/app.
---

# Website pages and SEO

Next **16** App Router, Tailwind **v4**, TypeScript, Resend. No database, no
auth — the site is marketing plus a waitlist. Built to the BullRider.pro
pattern.

> Read the relevant guide in `node_modules/next/dist/docs/` before writing
> code. This Next version has breaking changes against training data, and
> `AGENTS.md` makes that a hard rule for the repo.

## Canonical host

**`https://www.breakawayroping.pro` — `www` is primary.** Every canonical URL,
the sitemap, and every OG tag assume it, and the apex is expected to redirect.
A new page that hard-codes the apex breaks that consistency. Use
`metadataBase` from the root layout rather than repeating the origin.

## Adding a page

1. `src/app/<route>/page.tsx`, exporting `metadata` with at minimum `title`,
   `description`, `alternates.canonical`, and `openGraph`.
2. Add the route to `src/app/sitemap.ts`. A page absent from the sitemap is a
   page that was not really shipped.
3. Style with the brand tokens (see the `rodeo-brand` skill) — no hex literals.
4. Structured data goes through `src/app/components/SchemaMarkup.tsx`. The site
   already emits JSON-LD for the app, the site, and the rules FAQ; extend those
   rather than adding a second competing graph.

## Adding a blog post

Posts live at `src/app/blog/<slug>/page.tsx` and are **registered in
`src/app/blog/posts.ts`** — the index and the sitemap both read from there, so
a post added without the entry is unreachable. Match the voice of the seven
existing posts: written for ropers, specific about associations and divisions,
not keyword soup.

## The waitlist route

`src/app/api/waitlist/route.ts` — the only server logic on the site.

- Sends from `support@breakawayroping.pro` via Resend; **`breakawayroping.pro`
  must be verified in Resend** or every send fails.
- It **reports real outcomes**: a failed send answers `502` rather than
  pretending the signup worked. Keep that. Do not "simplify" it into an
  always-200 handler.
- Keeps a permissive email pattern on purpose — it rejects real typos without
  bouncing unusual-but-valid addresses.
- Per-IP throttle is in-memory: it resets on deploy and counts per serverless
  instance. Enough for casual bot spam, not a shared limiter. If the form gets
  deliberately targeted, that needs a real store, not a bigger `Map`.
- The honeypot field is deliberately named so browser autofill will not trip
  it. Do not rename it back to something autofill recognises.

## Before pushing

`npm run build` and `npm run lint` both clean. The site's 21 routes build green
today; keep it that way.
