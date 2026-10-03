#!/usr/bin/env node
// Nightly backup of the irreplaceable data (audit R-27): reads production through a read-only
// transaction and writes ONE encrypted file. Encrypted to the public key in supabase/backup-recipient.txt;
// the private key lives only with the owner (never in the repo, GitHub or CI), so a leaked file is noise.
//
//   DATABASE_URL=... EXPECTED_PROJECT_REF=... node scripts/backup-user-data.mjs [--out backup.json.gz.age]
//
// Prints per-table row counts (no data) and, in CI, adds them to the job summary.
import fs from "node:fs";
import { connect } from "./lib/db.mjs";
import { dump, seal } from "./lib/backup.mjs";

const out = process.argv.includes("--out") ? process.argv[process.argv.indexOf("--out") + 1] : "backup.json.gz.age";
const recipient = fs.readFileSync(new URL("../supabase/backup-recipient.txt", import.meta.url), "utf8").trim();

const client = await connect();
let data;
try {
  data = await dump(client);
} finally {
  await client.end();
}
const encrypted = await seal(data, recipient);
fs.writeFileSync(out, encrypted, { mode: 0o600 });

const lines = Object.entries(data.manifest).map(([t, m]) => `| ${t} | ${m.n} |`);
const summary = `### Backup ${data.createdAt}\n\n${fs.statSync(out).size} bytes encrypted (age), ${Object.keys(data.tables).length} tables, ${data.auth.users.length} auth users\n\n| table | rows |\n|---|---|\n${lines.join("\n")}\n`;
console.log(summary);
if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
