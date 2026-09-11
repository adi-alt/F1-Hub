#!/usr/bin/env node
// Applies a .sql file in supabase/migrations/ to the database in DATABASE_URL.
//
// Why this exists: the Supabase CLI isn't installed in this project and `psql` isn't on PATH, so
// until now `supabase/migrations/` had no way to actually run anything and schema changes were
// applied by hand.
//
// Applied migrations are recorded in `schema_migrations`, so re-running one is skipped rather than
// re-executed. That matters for any migration that ISN'T naturally idempotent - a one-off data
// backfill, say, which re-running would happily undo a user's later edit. Pass --force to run one
// anyway.
//
//   node scripts/apply-migration.mjs supabase/migrations/20260911_communities.sql
//   node scripts/apply-migration.mjs --dry supabase/migrations/20260911_communities.sql
//   node scripts/apply-migration.mjs --force supabase/migrations/20260911_communities.sql
//   node scripts/apply-migration.mjs --status
//
// DATABASE_URL is read from .env.local (the pooled connection - the direct db.*.supabase.co host
// is IPv6-only and unreachable from some networks).

import fs from "node:fs";
import path from "node:path";
import pg from "pg";

const args = process.argv.slice(2);
const dryRun = args.includes("--dry");
const force = args.includes("--force");
const status = args.includes("--status");
const file = args.find((a) => !a.startsWith("--"));

if (!file && !status) {
  console.error("usage: node scripts/apply-migration.mjs [--dry|--force|--status] <path-to.sql>");
  process.exit(1);
}

const sql = file ? fs.readFileSync(path.resolve(file), "utf8") : "";

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

await client.query(`create table if not exists schema_migrations (
  name text primary key,
  applied_at timestamptz not null default now()
)`);

if (status) {
  const { rows } = await client.query("select name, applied_at from schema_migrations order by applied_at");
  const onDisk = fs.readdirSync(new URL("../supabase/migrations", import.meta.url)).filter((f) => f.endsWith(".sql")).sort();
  const applied = new Set(rows.map((r) => r.name));
  for (const name of onDisk) console.log(`${applied.has(name) ? "applied" : "PENDING"}  ${name}`);
  await client.end();
  process.exit(0);
}

const name = path.basename(file);
const { rows: already } = await client.query("select applied_at from schema_migrations where name = $1", [name]);
if (already.length > 0 && !force) {
  console.log(`skipped ${name} - already applied ${already[0].applied_at.toISOString()} (use --force to run anyway)`);
  await client.end();
  process.exit(0);
}

// One transaction for the whole file, INCLUDING the ledger row: a migration that fails halfway
// leaves the schema exactly as it was and is not recorded as applied. Postgres runs DDL
// transactionally, unlike MySQL.
try {
  await client.query("begin");
  await client.query(sql);
  await client.query("insert into schema_migrations (name) values ($1) on conflict (name) do update set applied_at = now()", [name]);
  await client.query("commit");
  console.log(`applied ${name}`);
} catch (err) {
  await client.query("rollback").catch(() => {});
  console.error(`FAILED ${name} - rolled back, schema unchanged`);
  console.error(err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
