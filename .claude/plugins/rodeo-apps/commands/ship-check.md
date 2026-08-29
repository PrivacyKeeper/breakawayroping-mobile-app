---
description: Run the checks that must be clean before pushing, for whichever repo you are in.
allowed-tools: Bash, Read, Glob
---

Detect the repo from the working directory and run its pre-push checks. Report
the actual output — if something fails, say so and show the failure rather than
summarising it as fine.

**`breakawayroping-website`** (has `package.json` with `next`):

```bash
npm run lint
npm run build
```

Then confirm: every route in `src/app` that is a page has an entry in
`src/app/sitemap.ts`; every blog post directory has an entry in
`src/app/blog/posts.ts`; no component contains a raw hex colour or a stock
Tailwind palette class instead of a brand token.

**`breakawayroping-mobile-app`** (has `supabase/`):

Report whether `supabase db pull` has been run — migrations `003`–`006` still
missing means the repo is behind and further schema work should wait. If an
Expo app exists by then, also run its typecheck and lint.

Finish with a one-line verdict: safe to push, or what has to be fixed first.
