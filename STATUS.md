# BreakawayRoping.pro — status

Last updated: 30 July 2026

## Where things stand

### Website — `breakawayroping-website` — **done and on `main`**

Commit `ad42fe6`. 21 routes, build green, lint clean.

Landing page with 14 feature groups (121 individual features) adapted from the
BarrelConnect screen inventory, `/rules` reference, `/events`, `/support`,
7 SEO blog posts, terms / privacy / refund, `robots.ts`, `sitemap.ts`, JSON-LD
for app + site + rules FAQ. Built to the BullRider.pro pattern: Next 16 App
Router, Tailwind v4, Resend waitlist, no database, no auth.

**Blocked on you:**

- `public/logo.png` and `public/cross.jpg` are referenced but not in the repo —
  two broken image boxes until they are added. Optional:
  `public/backgrounds/arena-1.jpg` and `arena-2.jpg` turn on the arena backdrop.
- Vercel: import the repo, set `RESEND_API_KEY`, point `breakawayroping.pro`
  at it. Make `www` primary and redirect the apex — every canonical URL and the
  sitemap use `https://www.breakawayroping.pro`.
- Resend: verify `breakawayroping.pro` as a sending domain, or the waitlist
  cannot send from `support@breakawayroping.pro`.

### Supabase — **schema applied, 6 migrations**

Project `breakawayroping.pro`, ref `zocyoakcyrwdeugkjrgh`, `ca-central-1`.
34 tables, RLS enabled on every one. See `supabase/migrations/README.md`.

Covers phases 0–2 of the build map plus the rule-versioning architecture the
2026 addendum requires:

- Profiles with WPRA / NHSRA / NJHSRA / NLBRA / NIRA / PRCA membership fields
- Guardian links with per-minor media, DM, and recruiting switches
- Blocks, mutes, reports (harassment and unwanted contact called out explicitly)
- Follows, posts, comments, likes, bookmarks, stories, notifications
- Community groups — regional women's, junior, barn, team, school
- Mentorships with two-sided consent and guardian approval
- DMs and group chats
- First-check board
- Horses with `br_role`, `run_style`, `stop_rating`, `honest_in_box`, arena stats
- Calves with speed / duck / stop flags
- `br_practice_runs` — hand-timed, structurally cannot become official
- `br_equipment_checks` — pass/fail derived from WPRA 12.10.9, not client-supplied
- `rule_sets` / `rule_set_entries` / `rule_change_log` + `rules_for()`, seeded
  with WPRA and PRCA 2026

**First thing to do here:** run `supabase db pull` to get migrations 003–006
into version control. Right now the database is ahead of this repo. Details in
`supabase/migrations/README.md`.

### Mobile app — **not started**

This repo has migrations and docs only. No Expo scaffold yet.

## Next up, in order

1. `supabase db pull` so the repo matches the database
2. Expo + Expo Router scaffold, §11 route tree, brand theme tokens
3. `lib/scoring/breakaway` — `BR_PENALTIES`, `officialTime`, §12 edge cases as
   tests. **Diff PRCA 2026 Parts 9 and 10 first**, per the addendum
4. Events, entries, draws, divisional payouts (recompute whole class, never
   increment)
5. Producer console

## Decisions made, for the record

- **Palette comes from the crest**, not the build map. Electric blue `#2eb3ec`,
  rope gold `#d4af37`, cream `#f2e8d5` on near-black navy `#070c15`. The map
  said "hot coral and gold on charcoal plum"; the real logo won.
- **BarrelConnect's live schema is the spine**, since
  `00_RODEOAPPS_SHARED_SPINE.md` was never provided. Its 104 tables were read
  directly from the production database and the shared core adapted here.
- **Minor-safety rules live in the database**, not the client. The privacy
  policy commits to them, so they hold regardless of which client writes.

## Open questions

- Which BarrelConnect branch is the one to finish? There are 20+ remote
  branches (`development`, `feature/*`, `fix/*`, `integration/*`). Not touching
  any of it until told which.
- Waitlist signups currently go to email only, no database. Worth a table now
  that Supabase exists?

## Unrelated, but worth fixing

`barrelconnect-mobile-app` has `src/assets/keystore/barrel-connect.keystore`
committed. That is the Android signing key — anyone with repo access can ship a
build Play Store treats as authentic, and it cannot be rotated without breaking
upgrades for installed users. Move it to EAS credentials. The `.env` next to it
is low-risk by comparison since those are all `EXPO_PUBLIC_*` values that ship
in the bundle anyway.
