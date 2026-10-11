# Database

> **No staging project right now.** Staging (`wmdgbmlpvszyapewygvs`) was deleted on 2026-10-09. Every job that used it (migrate's staging job, e2e, the backup drill, race-photos' staging target) is off behind the repository variable `STAGING_ENABLED`, and production migrations no longer wait for staging: the `production-db` approval and the fingerprint check are the only gate. To bring staging back: create a project, put its secrets in the GitHub `staging` environment, replace the old project ref in the workflows and scripts, rebuild it (below), restore `needs: staging` in migrate.yml, and set `STAGING_ENABLED=true`.

Two Supabase projects, and migrations reach both through CI (`.github/workflows/migrate.yml`):

| | Project | Gets migrations | Data |
|---|---|---|---|
| **production** | `opnfquuowxkabtqxxraa` | after a reviewer approves the `production-db` environment run, from `main` only | real |
| **staging** | `wmdgbmlpvszyapewygvs` | automatically, from a pull request | public F1 reference data + synthetic users |

## Adding a migration
1. Add `supabase/migrations/YYYYMMDD_name.sql`. Make it safe to run twice where you can (`if not exists`, drop-before-add).
2. Open a pull request. The `staging` job applies it to staging and then checks staging against `schema.fingerprint.json`.
3. If the schema changed on purpose, refresh the fingerprint from a staging database built from the migrations and commit it:
   `DATABASE_URL=<staging> EXPECTED_PROJECT_REF=wmdgbmlpvszyapewygvs node scripts/schema-fingerprint.mjs --write`
4. After the merge, the `production` job waits for approval in GitHub, applies what is pending, and runs the same check against production.

Every script prints the project it is talking to and honours `EXPECTED_PROJECT_REF`, which refuses to run against any other project.

## Rebuilding staging from nothing
```sh
DATABASE_URL=<staging> node scripts/apply-migration.mjs supabase/schema.sql   # the base schema
DATABASE_URL=<staging> node scripts/apply-pending.mjs                          # every migration
PRODUCTION_DATABASE_URL=<prod> STAGING_DATABASE_URL=<staging> node scripts/staging/copy-reference-data.mjs
STAGING_DATABASE_URL=... STAGING_SUPABASE_URL=... STAGING_SUPABASE_SECRET_KEY=... STAGING_SEED_PASSWORD=... node scripts/staging/seed.mjs
```
Production is only ever read. No personal data is copied: the seed creates synthetic `@seed.invalid` users (confirmed in the admin API, so no inbox is needed) and their communities, posts, picks and prediction rounds in each state.

## Known drift
`schema.drift-allowlist.json` lists differences between production and the migrations that are known and explained:
- **`user_invites`** exists only in production. It came from the unmerged branch `feat/user-invitations` (its migration, `20260923_user_invites.sql`, is in production's ledger but not on `main`). Nothing on `main` uses it and it is empty. Merge the feature or drop the table; the entry goes either way.

## Backups and restore (R-27)
`.github/workflows/backup.yml` takes a nightly backup of the data that cannot be rebuilt (accounts, communities, picks, points and the frozen model predictions in `races`) from production, through a read-only transaction. It is one file, `backup.json.gz.age`, kept as a workflow artifact for 30 days.

- **Encrypted to a public key.** `supabase/backup-recipient.txt` is the public key. The private key is never in the repo, GitHub or CI, so a leaked artifact is unreadable. Only the owner can open it.
- **Keep the private key safe.** Copy `~/.apex-backup/age-identity.txt` into a password manager. Lose it and every backup is unreadable. To rotate: generate a new key, replace `backup-recipient.txt`, and keep the old private key for as long as old backups matter.
- **Every table is classified** in `scripts/lib/backup-tables.mjs` as irreplaceable (backed up), rebuildable (the pipeline refills it) or ephemeral (one-time codes). A new table fails `backup.test.ts` until it is classified, so one can't be silently left out.
- **The drill** (`node scripts/restore-drill.mjs`, run by the `drill` job against staging on every change to the backup code) dumps, encrypts, decrypts, restores into a throwaway `drill_*` schema, compares order-independent md5 fingerprints per table, and drops the schema. It never writes to `public`.

To restore, download the artifact, then decrypt and inspect with the private key:
```sh
DATABASE_URL=<a scratch or staging database> EXPECTED_PROJECT_REF=<its ref> \
  node scripts/restore-drill.mjs --in backup.json.gz.age --identity ~/.apex-backup/age-identity.txt
```
This restores into a throwaway `drill_*` schema and checks it against the backup's own fingerprints.
Restoring into a real project is a deliberate manual step, done into a scratch schema first and checked against the manifest's row counts.

Not covered: the Supabase Auth tables are dumped (users, identities) but the drill does not restore them (Auth's own tables are managed by Supabase); and Storage buckets (media) are not backed up, since the pipeline can refetch them. Supabase's own daily backups and point-in-time recovery depend on the plan: confirm which you have.
