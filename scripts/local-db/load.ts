// Builds a DISPOSABLE local copy of the app's database (audit R-21/R-27): the repo's real schema and
// migrations (the same loader the db test suites use), deterministic F1 reference data (reference.sql),
// and the synthetic users, communities and prediction rounds staging used to have (seed-app.mjs). The
// browser tests and the backup restore drill run against it in CI, in place of a staging project.
//
//   LOCAL_DATABASE_URL=postgres://postgres:postgres@127.0.0.1:5432/postgres npx tsx scripts/local-db/load.ts
//
// Refuses anything but a localhost / CI service-container Postgres, and a database that already has the
// schema (build a fresh one instead). Ends with NOTIFY pgrst so a running PostgREST picks the schema up.
import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import { loadAppSchema } from "../../src/lib/__tests__/db/schemaLoader";
import { USERS, seedApp } from "../staging/seed-app.mjs";

// Supabase Auth's other table the backup reads (scripts/lib/backup-tables.mjs AUTH_TABLES); the test shim
// only needs auth.users.
const AUTH_EXTRA = `create table auth.identities (id uuid primary key default gen_random_uuid(), user_id uuid references auth.users (id) on delete cascade, provider text, identity_data jsonb);`;

type Query = (sql: string, params?: unknown[]) => Promise<{ rows: Record<string, unknown>[] }>;

/** Schema, reference data and seed, into the database behind `query` (a pg client, or PGlite in a test). */
export async function loadLocalDb(query: Query) {
  if ((await query(`select to_regclass('public.races') is not null as e`)).rows[0].e) throw new Error("this database already has the schema; load into a fresh one");
  await loadAppSchema((sql) => query(sql));
  await query(AUTH_EXTRA);
  await query(fs.readFileSync(path.join(__dirname, "reference.sql"), "utf8"));
  await query("begin");
  const users = USERS as unknown as { id: string; email: string }[];
  users.forEach((u, i) => (u.id = `00000000-0000-4000-8000-00000000000${i + 1}`));
  for (const u of users) {
    await query(`insert into auth.users (id, email, raw_user_meta_data) values ($1, $2, '{"seed":true}')`, [u.id, u.email]);
    await query(`insert into auth.identities (user_id, provider, identity_data) values ($1, 'email', jsonb_build_object('email', $2::text))`, [u.id, u.email]);
  }
  await seedApp({ query });
  await query("commit");
  return users.length;
}

async function main() {
  const url = process.env.LOCAL_DATABASE_URL;
  if (!url) throw new Error("set LOCAL_DATABASE_URL to a disposable local Postgres");
  if (!["localhost", "127.0.0.1", "postgres"].includes(new URL(url).hostname)) throw new Error("LOCAL_DATABASE_URL must be a local Postgres (localhost, 127.0.0.1 or the CI service `postgres`)");
  const c = new pg.Client({ connectionString: url });
  await c.connect();
  try {
    const n = await loadLocalDb((sql, params) => c.query(sql, params));
    await c.query(`notify pgrst, 'reload schema'`);
    console.log(`local database ready: schema, reference data, ${n} seeded users`);
  } finally {
    await c.end();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error(err.message);
    process.exit(1);
  });
}
