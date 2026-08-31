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

**The schedule that calls `send-push` already exists.** It is a pg_cron job on
the database (`drain-push-outbox`, migration 0039), so there is no external
cron to stand up. It runs every minute and does nothing at all until the
worker secret is in Vault — no secret means no request, not a failed request a
minute forever. The same when the queue is empty, which it usually is.

So after setting `PUSH_WORKER_SECRET` above, store the same value where the
caller can read it, once:

```sql
select vault.create_secret('<the same value>', 'push_worker_secret',
                           'Shared secret for the send-push worker');
```

Check the whole path with one query:

```sql
select * from public.push_worker_status();
```

It answers "why has nobody been notified?" — whether the secret is set, whether
the schedule is running, how many notices are waiting, and what is stuck.

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
server-side.

**`npm run verify:live` closes it in about ten seconds**, from anywhere with
network access to the project:

```
npm run verify:live
```

It reads `.env`, creates a throwaway account, and checks the things only a
real host can answer: that the API responds, that this app's event codes
exist in `reference_options`, that sign-up fires the provisioning trigger,
that RLS returns your own rows and refuses everybody else's, that a practice
run writes and a forged official run is rejected, and that `analyse-run` and
`delete-account` are deployed and answer. It deletes the account on the way
out, so it is safe against production.

Run it before the first build, not after. It does not cover the UI, and it
does not cover push delivery — that needs a token from a real handset, so it
waits for TestFlight. Start with one app; the other six share the same data
layer.

## Deliberately not done

- **Stripe.** Entries are created `pending` and unpaid. Nothing in the app
  charges anybody.
- **Producer console.** These are contestant apps. A producer still runs
  the books elsewhere.
