# Runbook

What to do, in order, for the routine and not-so-routine operations. Project refs: production
`opnfquuowxkabtqxxraa`; there is no staging project at the moment (see `supabase/README.md`).

## Deploy

- Vercel deploys `main` to production on every push, and every other branch as a preview. Merge only
  when CI (`ci.yml`) and the browser tests (`e2e.yml`) are green.
- The app's environment lives in Vercel (Project → Settings → Environment Variables). A changed
  variable takes effect on the next deployment: redeploy after changing one.
- **Rollback:** in Vercel, Deployments → the last good production deployment → Promote to Production.
  This rolls back code only. A migration that already ran stays applied, so a migration that the old
  code can't live with needs a forward fix (below).
- **Stale pages after a data fix:** cached data is refreshed by tag. The pipeline calls
  `POST /api/admin/revalidate` with header `x-cron-secret: $CRON_SECRET` and body `{"tag": "races"}`;
  do the same by hand with the tag that changed (see `src/lib/cacheTags.ts`).

## Database migrations

1. Add `supabase/migrations/YYYYMMDD_name.sql`, idempotent where possible. `npm test` loads every
   migration into PGlite; the race-condition suite and the browser tests load them into real Postgres.
2. If the schema changed on purpose, refresh `supabase/schema.fingerprint.json`
   (`node scripts/schema-fingerprint.mjs --write` against a database built from the migrations) and
   classify any new table in `scripts/lib/backup-tables.mjs` (the backup test fails until you do).
3. After merge, `migrate.yml`'s `production` job waits for approval on the `production-db` environment.
   **Approving:** read the job's "Show what is pending" step first; approve only migrations you have
   reviewed in the merged PR. The job then applies them and checks production against the fingerprint.
4. A failed fingerprint check means production differs from the migrations: compare with
   `node scripts/schema-fingerprint.mjs --check` output, and either fix forward with a new migration or
   record a known difference in `supabase/schema.drift-allowlist.json` with its reason.

Never run SQL against production by hand except to diagnose (read-only). Fixes go through a migration.

## Backups and restore

- `backup.yml` takes a nightly encrypted backup of the irreplaceable tables (accounts, communities,
  picks, points, frozen predictions) from production, kept 30 days as a workflow artifact. It is
  encrypted to `supabase/backup-recipient.txt`; the private key is held only by the owner
  (`~/.apex-backup/age-identity.txt`, copied to a password manager).
- The `drill` job dumps, encrypts, restores and fingerprint-checks a disposable Postgres on every
  change to the backup code or the schema. `npm test` runs the same drill on PGlite.
- **Restore:** download the artifact from the backup run, then restore into a scratch schema of a
  scratch database and verify:
  ```sh
  DATABASE_URL=<scratch database> node scripts/restore-drill.mjs --in backup.json.gz.age --identity ~/.apex-backup/age-identity.txt
  ```
  Copying rows back into a live project is a deliberate manual step: from the verified scratch schema,
  table by table, checked against the manifest's row counts. Supabase Auth users are in the dump but
  not restored by the drill. Storage media is not backed up (the pipeline refetches it).
- Confirm which Supabase plan-level backups / point-in-time recovery the project has before relying on them.

## Pipeline failures

- **Where to look:** the Actions tab (`fetch-races.yml` runs every 15 minutes), Sentry (when
  `SENTRY_DSN` is set), the `pipeline_runs` ledger, and `GET /api/health` (503 when the database
  doesn't answer or the last successful run is too old).
- **Fetch failed:** the next tick retries. F1 live timing is unreachable from GitHub's runners, so CI
  uses Jolpica for official results and OpenF1 as a preliminary fallback. OpenF1 answers 401 to free
  access while a session is live; data comes back once it ends. A race identity conflict fails the
  step on purpose (see `pipeline/race_identity.py`): resolve the duplicate by hand, then re-run.
- **Catch up after an outage:** run "Fetch race data and predict" manually with `force_all_rounds`.
- **Audit step red** (`audit_data_consistency.py`): a bad write landed. It doesn't roll anything back;
  find the round it names, fix the data with a reviewed migration or a pipeline re-run, and
  revalidate.
- **Emails:** `email-jobs.yml` calls `/api/cron/emails` hourly; each email goes once per person per
  race, so a re-run is safe.

## Rotating secrets

Rotate on any suspected leak, when someone with access leaves, and after removing a feature that held
a key (for example the old NVIDIA and Hugging Face keys: delete them from Vercel if still present).

| Secret | Where it lives | Effect of rotating |
|---|---|---|
| `SUPABASE_SECRET_KEY`, publishable key | Supabase → API keys; then Vercel and GitHub secrets | Old key stops working at once: update Vercel and GitHub first, then revoke |
| `DATABASE_URL` password | Supabase → Database; GitHub secrets | Pipeline, migrations and backups use it |
| `SESSION_SECRET` | Vercel | Signs everyone out (cookies can't be unsealed) and invalidates invite links if `INVITE_TOKEN_SECRET` is unset |
| `INVITE_TOKEN_SECRET` | Vercel | Outstanding invite links stop working |
| `CRON_SECRET` | Vercel and GitHub secrets, together | Revalidation and email jobs fail until both match |
| AI provider keys | Groq / OpenRouter consoles; Vercel | None visible: surfaces fall back while a key is missing |
| `SMTP_PASS` | Mail provider; Vercel | Sign-in codes fail until updated |
| `GITHUB_TOKEN` | GitHub PAT; Vercel | Admin Models page only |
| Backup key pair | Owner's machine; `supabase/backup-recipient.txt` | Keep the old private key while old backups matter |

## Incident basics

1. **Assess:** is the site up (`/api/health`), what's broken, since when (Sentry, Vercel logs,
   Actions). Note the time.
2. **Stop the bleeding:**
   - AI misbehaving or a runaway bill: set `AI_DISABLED=1` in Vercel and redeploy; every surface serves
     its deterministic content.
   - Bad deploy: promote the last good deployment (above).
   - Bad data: pause the pipeline (disable `fetch-races.yml` in the Actions tab) before fixing.
   - Leaked secret: rotate it (above).
3. **Fix** forward through a PR (and a migration for data or schema), then re-enable what you paused.
4. **Write down** what happened, the impact, and what would have caught it sooner; add the test or
   alert.
