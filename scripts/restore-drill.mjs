#!/usr/bin/env node
// A restore drill (audit R-27). Two modes, both restore into a throwaway `drill_*` schema and drop it
// afterwards: nothing in `public` is ever written.
//
//   self-test (CI, staging): dumps the database with a throwaway key, restores that dump, and checks every
//     table's rows against the fingerprint taken at dump time. Proves dump and restore work on today's
//     schema, and (through dump's own check) that no table is unclassified.
//       DATABASE_URL=<staging> EXPECTED_PROJECT_REF=wmdgbmlpvszyapewygvs node scripts/restore-drill.mjs
//
//   from a real backup: restores that file with the owner's private key into a scratch schema and verifies it.
//       DATABASE_URL=<staging> EXPECTED_PROJECT_REF=... node scripts/restore-drill.mjs --in backup.json.gz.age --identity ~/.apex-backup/age-identity.txt
import fs from "node:fs";
import { generateIdentity, identityToRecipient } from "age-encryption";
import { connect } from "./lib/db.mjs";
import { dump, open, restoreToScratch, seal } from "./lib/backup.mjs";

const arg = (name) => (process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : null);
const inFile = arg("--in");
const identityFile = arg("--identity");

const client = await connect();
let failed = false;
try {
  let data;
  if (inFile) {
    if (!identityFile) throw new Error("--in needs --identity <private key file>");
    const identity = fs.readFileSync(identityFile, "utf8").split("\n").find((l) => l.startsWith("AGE-SECRET-KEY-"));
    data = await open(fs.readFileSync(inFile), identity);
    console.log(`restoring ${inFile} (taken ${data.createdAt})`);
  } else {
    const identity = await generateIdentity();
    data = await open(await seal(await dump(client), await identityToRecipient(identity)), identity);
    console.log(`self-test: dumped and re-opened ${Object.keys(data.tables).length} tables`);
  }
  const schema = `drill_${new Date().toISOString().slice(0, 10).replace(/-/g, "")}_${Math.random().toString(36).slice(2, 6)}`;
  const results = await restoreToScratch(client, data, schema);
  for (const r of results) console.log(`${r.ok ? "ok  " : "FAIL"} ${r.table} (${r.rows} rows)`);
  failed = results.some((r) => !r.ok);
  console.log(failed ? "RESTORE DRILL FAILED" : `restore drill passed: ${results.length} tables restored into ${schema} and matched, schema dropped`);
  console.log(`not restored here: Supabase Auth (${data.auth.users.length} users, ${data.auth.identities.length} identities) - see supabase/README.md`);
} finally {
  await client.end();
}
process.exit(failed ? 1 : 0);
