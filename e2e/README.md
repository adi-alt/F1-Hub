# Browser tests

Playwright against the built app (audit R-21): axe on the key routes signed in and out, the design-system
visual baselines on `/dev/ui`, sideways scroll and layout at phone widths, and the keyboard-only sign-in
dialog. Tests sign in by minting the app's own session cookie for a seeded user (`support.ts`), and AI
routes are blocked in the browser.

## Against a disposable local database (CI default)

`.github/workflows/e2e.yml` (job `e2e`) runs this on every pull request with no secrets:

1. A Postgres 16 service container gets the repo's real schema and migrations (the same loader the db
   test suites use), deterministic reference data (`scripts/local-db/reference.sql`) and the synthetic
   users, communities and prediction rounds (`scripts/staging/seed-app.mjs`):
   `npx tsx scripts/local-db/load.ts`.
2. A PostgREST service container serves it. `scripts/local-db/supabase.mjs` stands in for the Supabase
   API in front of it (`/rest/v1/*` is proxied; auth answers "no user"; storage and realtime 404), and
   `--env` prints the app's Supabase env with test-only keys.
3. With `E2E_LOCAL=1`, `playwright.config.ts` starts the stand-in alongside `next start`.

Locally, with Docker:

```sh
docker run -d --name apex-pg -e POSTGRES_PASSWORD=postgres -p 5432:5432 postgres:16
docker run -d --name apex-rest -p 3000:3000 --add-host=host.docker.internal:host-gateway \
  -e PGRST_DB_URI=postgres://postgres:postgres@host.docker.internal:5432/postgres \
  -e PGRST_DB_SCHEMAS=public -e PGRST_DB_ANON_ROLE=anon \
  -e PGRST_JWT_SECRET=apex-local-only-jwt-secret-not-used-anywhere-real postgrest/postgrest:v12.2.12
LOCAL_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npx tsx scripts/local-db/load.ts
set -a; eval "$(node scripts/local-db/supabase.mjs --env)"; set +a
UI_PREVIEW=1 npx next build && E2E_LOCAL=1 UI_PREVIEW=1 npx playwright test
```

The loader refuses a non-local database and one that already has the schema: drop the container to
start again.

## Against staging

Job `e2e-staging` runs the same suite against the staging project while `vars.STAGING_ENABLED` is
`true` (staging was deleted on 2026-10-14). `e2e/global-setup.ts` refuses any project but staging or a
localhost URL.

## Visual baselines

A missing baseline is written, not failed. Baselines are per platform; CI's are the `*-linux.png` files.
Commit the `visual-baselines` artifact a run uploads to accept new ones.
