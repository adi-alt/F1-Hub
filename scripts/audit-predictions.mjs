#!/usr/bin/env node
// Read-only historical audit of prediction rounds, entries, personal picks and the points ledger.
//
//   node scripts/audit-predictions.mjs            human-readable report
//   node scripts/audit-predictions.mjs --json     every finding, machine-readable
//   node scripts/audit-predictions.mjs --limit 50 rows kept per finding (default 200)
//
// It runs inside a READ ONLY transaction (Postgres itself refuses any write) and prints user ids,
// group ids and counts only - no emails, names or secrets. DATABASE_URL is read from .env.local and
// never printed. Run it BEFORE applying supabase/migrations/20260930_prediction_lifecycle.sql to
// capture the baseline, and against staging first.
//
// It changes nothing and proposes nothing automatically: what to do about a finding (leave it,
// annotate it, void or re-score it) is a decision for a person - see the correction plan in
// docs/audit/M0_IMPLEMENTATION_STATUS.md.

import fs from "node:fs";
import pg from "pg";
import { formatReport, runPredictionAudit } from "./lib/predictionAudit.mjs";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const limitArg = args.indexOf("--limit");
const limit = limitArg >= 0 ? Math.max(1, Number(args[limitArg + 1]) || 200) : 200;

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const connectionString = (env.match(/^DATABASE_URL=(.*)$/m) ?? [])[1];
if (!connectionString) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
try {
  await client.query("begin read only");
  const results = await runPredictionAudit((sql) => client.query(sql), { limit });
  console.log(asJson ? JSON.stringify(results, null, 2) : formatReport(results));
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}
