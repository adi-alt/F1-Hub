# Apex F1 Hub

An F1 companion site: the current season (results, standings, race pages with model predictions and
replays), a circuit library, an archive back to 1950, communities with posts and prediction leagues,
race picks, and grounded AI summaries on top of the data. Live at https://apexf1hub.com.

- **App:** Next.js 16 (App Router), React 19, Tailwind 4, TanStack Query, deployed on Vercel.
  Read `node_modules/next/dist/docs/` before using an unfamiliar Next API: this version differs from
  older ones (see `AGENTS.md`).
- **Data:** Supabase Postgres. The server reads and writes through the service-role client
  (`src/lib/supabase/admin.ts`); the browser never talks to the database directly. Sessions are the
  app's own sealed cookie (iron-session, `src/lib/session/`), with sign-in by email code or password.
- **Pipeline:** Python jobs on GitHub Actions fetch results (Jolpica, OpenF1, FastF1), train the
  prediction models and score picks. See [pipeline/README.md](pipeline/README.md).
- **AI:** Groq with OpenRouter as fallback, behind caches, quotas and a kill switch; every surface has
  a deterministic fallback. See [docs/AGENTIC_AI.md](docs/AGENTIC_AI.md).

Operations (deploys, migrations, backups, incidents, secret rotation): [docs/RUNBOOK.md](docs/RUNBOOK.md).

## Setup

Node (current LTS) and npm.

```sh
npm ci
cp .env.example .env.local   # fill in at least the "required" block
npm run dev                  # http://localhost:3000
```

The app needs a Supabase project (URL, publishable key, secret key) and `SESSION_SECRET`. Without SMTP
settings sign-in codes cannot be emailed; without AI keys every AI surface serves its deterministic
content. `/dev/ui` previews every design-system primitive in development.

## Scripts

| Command | What it does |
|---|---|
| `npm run dev` / `build` / `start` | Next.js dev server, production build, production server |
| `npm test` | Unit, route and database tests (`src/**/*.test.ts`, node:test via tsx). Database suites run on in-process Postgres (PGlite) loaded with the real schema and migrations |
| `npm run lint` | ESLint |
| `npm run lint:design` | Fails if a banned class pattern grows past `scripts/design-lint-baseline.json` (`--update` to lower the baseline) |
| `npm run lint:unused` | Fails if a file under `src/` has no importers (`scripts/unused-files.mjs`) |
| `npm run e2e` | Playwright: axe, visual baselines, layout and the sign-in dialog. See [e2e/README.md](e2e/README.md) |

`TEST_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npm test` also runs the
race-condition suite against a disposable real Postgres (CI does this in its own job).

CI (`.github/workflows/ci.yml`) runs `npm audit` (production deps, high), lint, both lint checks,
tests and a build with placeholder secrets, the race-condition suite, and the pipeline's Python tests.
`e2e.yml` runs the browser tests on every pull request against a disposable database.

## Environment

`.env.example` lists every variable with a comment. Names only here; values live in Vercel (app),
GitHub secrets (workflows) and your `.env.local`.

**App, required:** `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`,
`SUPABASE_SECRET_KEY` (server only), `SESSION_SECRET` (seals the session cookie), `CRON_SECRET`
(shared secret for `/api/admin/revalidate` and `/api/cron/emails`).

**App, optional:**

| Variable | Purpose |
|---|---|
| `APP_BASE_URL` | Canonical URL for email links and SEO (default `https://apexf1hub.com`) |
| `ADMIN_EMAILS` | Comma-separated site-admin emails (bootstrap allow-list) |
| `INVITE_TOKEN_SECRET` | Signs community invite links (falls back to `SESSION_SECRET`) |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Outgoing email: sign-in codes, invitations, notifications |
| `GROQ_API_KEY`, `OPENROUTER_API_KEY` | Default AI provider accounts |
| `GROQ_HOMEPAGE_API_KEY`, `OPENROUTER_HOMEPAGE_API_KEY` | Home intelligence and Ask Apex |
| `GROQ_RACE_INTELLIGENCE_API_KEY`, `OPENROUTER_RACE_INTELLIGENCE_API_KEY` | Race intelligence |
| `GROQ_SEASON_INTELLIGENCE_API_KEY`, `OPENROUTER_SEASON_INTELLIGENCE_API_KEY` | Season, compare, race-event and circuit takes |
| `AI_DISABLED` | Kill switch: `1` and no model is called |
| `AI_PROVIDER_RPM_LIMIT` | Provider requests per minute per instance (default 40) |
| `KLIPY_API_KEY` | GIF search in the post composer |
| `GITHUB_TOKEN` | Admin Models page: list and trigger pipeline workflows |
| `NEXT_PUBLIC_SENTRY_DSN` | Sentry, and the CSP report endpoint |
| `UI_PREVIEW` | `1` serves `/dev/ui` in a non-production build (CI's browser tests) |

Set by the platform, read but never configured: `NODE_ENV`, `CI`, `VERCEL_ENV`,
`NEXT_PUBLIC_VERCEL_ENV`, `VERCEL_GIT_COMMIT_SHA`, `NEXT_PUBLIC_VERCEL_GIT_COMMIT_SHA`.

**Scripts and CI:** `DATABASE_URL`, `EXPECTED_PROJECT_REF` (refuse any other project),
`RLS_SNAPSHOT_DATABASE_URL`, `TEST_DATABASE_URL`, `LOCAL_DATABASE_URL`, `LOCAL_SUPABASE_PORT`,
`POSTGREST_URL`, `E2E_LOCAL`, `E2E_PORT`, `E2E_ALLOW_OTHER_PROJECT`, and the staging tooling's
`PRODUCTION_DATABASE_URL`, `STAGING_DATABASE_URL`, `STAGING_PROJECT_REF`, `STAGING_SUPABASE_URL`,
`STAGING_SUPABASE_SECRET_KEY`, `STAGING_SEED_PASSWORD`.

**Pipeline:** `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SECRET_KEY` (Storage uploads),
`CRON_SECRET` and `APP_BASE_URL` (cache revalidation), `SENTRY_DSN`, `SENTRY_ENVIRONMENT`,
`FORCE_ALL_ROUNDS`, `RACE_PHOTOS_JSON`, `WEATHER_API_KEY` (not wired up yet),
`FIREBASE_SERVICE_ACCOUNT_JSON` (legacy migration only).

## Deploy

Vercel builds every push: `main` is production, other branches get preview deployments. Vercel holds
the app's environment; CI never sees production credentials. After a deploy that changes data shapes,
the pipeline's revalidation call (`/api/admin/revalidate`) refreshes cached pages. Details and
rollback: [docs/RUNBOOK.md](docs/RUNBOOK.md).

## Database migrations

Migrations are SQL files in `supabase/migrations/` (`YYYYMMDD_name.sql`), applied only through
`.github/workflows/migrate.yml`: after merge to `main`, the production job waits for approval on the
`production-db` environment, applies what is pending and checks the result against
`supabase/schema.fingerprint.json`. Every migration is also loaded by the test suites (PGlite, the
race-condition suite and the browser tests' disposable database), so a migration that does not apply
fails CI before it can merge. See [supabase/README.md](supabase/README.md).
