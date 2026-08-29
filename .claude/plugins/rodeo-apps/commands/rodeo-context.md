---
description: Summarise where the Rodeo Apps portfolio stands and what is blocked, from the repo's own docs.
allowed-tools: Read, Glob, Grep, Bash
---

Read `STATUS.md` (in `breakawayroping-mobile-app`), `supabase/migrations/README.md`,
and the repo's `CLAUDE.md`, then give a short briefing:

1. **Shipped** — what is actually done and on `main`.
2. **Blocked on the owner** — the items needing a human: missing image assets,
   Vercel and DNS setup, Resend domain verification, Search Console
   verification.
3. **Next up**, in the order the status doc gives.
4. **Open questions** that change what gets built — the OS architecture choice
   (Fastify API server vs direct Supabase with `auth.uid()` RLS), whether the
   OS builds on the shared database or the standalone 5-table schema, and the
   missing F1–F31 defect summary.

Keep it under a page. Flag anything in the docs that has gone stale against
what you can see in the repos, and say which claim you could not verify.
