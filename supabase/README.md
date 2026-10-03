# Database

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
