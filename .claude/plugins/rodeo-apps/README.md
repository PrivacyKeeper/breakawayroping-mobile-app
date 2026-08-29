# rodeo-apps

The conventions that apply across the Rodeo Apps repos, packaged as a Claude
Code plugin so they load automatically instead of being re-explained each
session. The same plugin is committed to `breakawayroping-website` and
`breakawayroping-mobile-app`.

## What it provides

**Skills** — load themselves when the work matches:

| Skill | Fires on |
| --- | --- |
| `supabase-migrations` | migrations, RLS, `db pull`/`db push`, any schema change |
| `minor-safety` | profiles, guardians, location, visibility, DMs, mentorships |
| `breakaway-scoring` | times, penalties, payouts, divisions, rule sets |
| `rodeo-brand` | colours, theme tokens, `globals.css`, styling |
| `site-seo` | pages, metadata, canonicals, sitemap, JSON-LD, the waitlist route |

**Commands** — run them by name:

| Command | Does |
| --- | --- |
| `/db-status` | repo migrations vs the live project, plus advisor findings |
| `/safety-audit` | audits the under-18 protections against the schema and diff |
| `/ship-check` | the checks that must be clean before pushing |
| `/rodeo-context` | where the portfolio stands and what is blocked |

**Agents** — delegate a review to them:

- `schema-reviewer` — reviews SQL before it is applied: RLS, tenancy,
  minor-safety, money paths, migration immutability.
- `site-auditor` — audits the website for metadata, canonical host, sitemap
  and blog registry coverage, JSON-LD, and brand-token use.

**Hook** — a `SessionStart` check that warns when `supabase/migrations/` is
behind the live database. Read-only, no network, silent in a repo with no
`supabase/` directory and silent once `supabase db pull` has run.

## How it is wired

`.claude-plugin/marketplace.json` at the repo root declares the plugin, with
its source as a relative path into this directory. `.claude/settings.json`
then registers and enables it:

```json
"extraKnownMarketplaces": {
  "rodeo-apps-marketplace": { "source": { "source": "directory", "path": "." } }
},
"enabledPlugins": { "rodeo-apps@rodeo-apps-marketplace": true }
```

Both are committed, so anyone who clones the repo gets the plugin with no
setup. It costs roughly 1k tokens of always-on context per session.

**The repo has to be trusted once** for project settings to take effect — run
Claude Code interactively in it and accept the trust dialog. Until then the
plugin, and the permission allowlist beside it, are ignored.

To turn it off for yourself without touching the shared config, put
`"enabledPlugins": {"rodeo-apps@rodeo-apps-marketplace": false}` in
`.claude/settings.local.json`.

## Changing it

Edit the files here, then validate before committing:

```bash
claude plugin validate --strict .claude/plugins/rodeo-apps
claude plugin validate --strict .          # the marketplace manifest
claude plugin details rodeo-apps           # inventory and token cost
```

The plugin is duplicated in both repos on purpose — each stays self-contained
and clonable on its own. **A change to one has to be copied to the other**;
they are meant to stay identical. If that gets tiresome, the alternative is
publishing it from one repo and having the other reference it by `github`
source instead of `directory`.
