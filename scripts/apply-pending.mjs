#!/usr/bin/env node
// Applies every migration in supabase/migrations/ that the target database's `schema_migrations` ledger
// doesn't list yet, in filename order, each in its own transaction (with its ledger row). Stops at the
// first failure and exits non-zero, leaving that migration rolled back. Used by CI
// (.github/workflows/migrate.yml); the single-file tool is scripts/apply-migration.mjs.
//
//   DATABASE_URL=... EXPECTED_PROJECT_REF=... node scripts/apply-pending.mjs [--dry]
import fs from "node:fs";
import path from "node:path";
import { connect } from "./lib/db.mjs";

const dry = process.argv.includes("--dry");
const dir = new URL("../supabase/migrations/", import.meta.url);
const files = fs.readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

const client = await connect();
let failed = false;
try {
  await client.query(`create table if not exists schema_migrations (name text primary key, applied_at timestamptz not null default now())`);
  const applied = new Set((await client.query("select name from schema_migrations")).rows.map((r) => r.name));
  const pending = files.filter((f) => !applied.has(f));
  const unknown = [...applied].filter((n) => !files.includes(n));
  if (unknown.length) console.log(`note: in the ledger but not on disk (applied from another branch?): ${unknown.join(", ")}`);
  console.log(pending.length ? `pending: ${pending.join(", ")}` : "nothing pending");
  for (const name of pending) {
    if (dry) { console.log(`would apply ${name}`); continue; }
    const sql = fs.readFileSync(new URL(name, dir), "utf8");
    try {
      await client.query("begin");
      await client.query(sql);
      await client.query("insert into schema_migrations (name) values ($1) on conflict (name) do update set applied_at = now()", [path.basename(name)]);
      await client.query("commit");
      console.log(`applied ${name}`);
    } catch (err) {
      await client.query("rollback").catch(() => {});
      console.error(`FAILED ${name} - rolled back: ${err.message}`);
      failed = true;
      break;
    }
  }
} finally {
  await client.end();
}
process.exit(failed ? 1 : 0);
