#!/usr/bin/env node
// Applies a .sql file in supabase/migrations/ to the database in DATABASE_URL.
//
// Why this exists: the Supabase CLI isn't installed in this project and `psql` isn't on PATH, so
// until now `supabase/migrations/` had no way to actually run anything and schema changes were
// applied by hand. Every migration here is written to be idempotent, so re-running one is a no-op.
//
//   node scripts/apply-migration.mjs supabase/migrations/20260911_communities.sql
//   node scripts/apply-migration.mjs --dry supabase/migrations/20260911_communities.sql
//
// DATABASE_URL is read from .env.local (the pooled connection - the direct db.*.supabase.co host
// is IPv6-only and unreachable from some networks).

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const file = args.find((a) => !a.startsWith("--"));

if (!file) {
  console.error("usage: node scripts/apply-migration.mjs [--dry] <path-to.sql>");
  process.exit(1);
}

const sql = fs.readFileSync(path.resolve(file), "utf8");

if (dryRun) {
  console.log(`-- dry run: ${file} (${sql.length} bytes), not executed`);
  console.log(sql);
  process.exit(0);
}

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const connectionString = (env.match(/^DATABASE_URL=(.*)$/m) ?? [])[1];
if (!connectionString) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();

// One transaction for the whole file: a migration that fails halfway leaves the schema exactly as
// it was, rather than half-applied. Postgres runs DDL transactionally, unlike MySQL.
try {
  await client.query("begin");
  await client.query(sql);
  await client.query("commit");
  console.log(`applied ${path.basename(file)}`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error(`FAILED ${path.basename(file)} - rolled back, schema unchanged`);
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
