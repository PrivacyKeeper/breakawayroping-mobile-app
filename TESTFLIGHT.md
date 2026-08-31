# Before this reaches TestFlight

Everything here is either a hard App Store requirement or a thing that will
waste a review cycle. Ordered so the blocking items come first.

## Secrets that must be set

These live on the shared Rodeo-OS Supabase project, under
**Edge Functions → Secrets**. Nothing in the repo carries them.

| Secret | What breaks without it |
|---|---|
| `OPENAI_API_KEY` | `/analyze` returns a clear error instead of analysing. Nothing is faked. |
| `PUSH_WORKER_SECRET` | `send-push` refuses every request, so notices are written and never delivered. It refuses rather than running open on purpose — an open sender is a spam relay carrying our identity. |

Then schedule `send-push` (a cron hitting the function with
`x-worker-secret`). Without the schedule the outbox fills and nothing drains
it.

## Per-app `.env`

Copy `.env.example` to `.env` and fill in:

- `EXPO_PUBLIC_SUPABASE_URL` / `EXPO_PUBLIC_SUPABASE_ANON_KEY` — required.
- `EXPO_PUBLIC_GOOGLE_MAPS_IOS_KEY` / `_ANDROID_KEY` — optional. Without
  them the arena map degrades to a coordinate card and a directions link,
  which still works. Restrict each key to its platform and to the Maps SDK.
- `EXPO_PUBLIC_WEATHER_API_KEY` and `EXPO_PUBLIC_WEATHER_PROVIDER` —
  optional. With no key the weather widget renders nothing at all, by
  design, rather than an empty box.

## EAS

`eas init` has not been run. Until a project id exists:

- push tokens cannot be issued — `registerForPush()` returns
  `no-project-id` and says so;
- `eas build` has nothing to build against.

## App Store review items already handled

Recorded so nobody re-litigates them during review prep.

- **Account deletion** (Guideline 5.1.1(v)) — in Profile. It de-identifies
  rather than deletes: the ledger is append-only and a producer's tax
  obligation for a closed year outlives the account. The identity goes.
- **App icon** — 1024×1024, RGB, no alpha. Apple rejects alpha at upload,
  after the build has already run.
- **Error boundary** — an uncaught render error shows a readable screen
  with a way back, not a white rectangle.
- **Permission strings** — camera, photos, location and notifications all
  carry a purpose string in `app.config.js`.

## What has NOT been verified

Worth knowing before the first build rather than after.

No screen has made a request to the real Supabase host. The sandbox this was
built in blocks it at the egress policy. Verification instead covers:

- the database layer directly — RLS proven against seeded rows, constraints
  proven by violating them, triggers proven to still fire after grants were
  revoked;
- every column, filter and write checked against a live schema snapshot;
- the whole data layer driven over real HTTP against a local PostgREST
  double.

The untested part is the real network hop with a live JWT and RLS enforced
server-side. **The first `eas build --profile production` is the thing that
closes it.** Start with one app — the other six were propagated from
tiedown and share the same data layer byte for byte.

## Deliberately not done

- **Stripe.** Entries are created `pending` and unpaid. Nothing in the app
  charges anybody.
- **Producer console.** These are contestant apps. A producer still runs
  the books elsewhere.
