#!/usr/bin/env node
// Read-only check of the live database's client-role exposure (audit SEC-01/02, M0 R-01).
// Run it before and after applying supabase/migrations/20260929_rls_lockdown.sql:
//
//   node scripts/verify-rls.mjs
//
// It only runs SELECTs against catalog views plus two aggregate tamper checks, inside a
// READ ONLY transaction, and prints no row data beyond counts and user ids - no emails, codes or
// keys. DATABASE_URL is read from .env.local (never printed). Exit code 1 if anything fails.

import fs from "node:fs";
import pg from "pg";

const env = fs.readFileSync(new URL("../.env.local", import.meta.url), "utf8");
const connectionString = (env.match(/^DATABASE_URL=(.*)$/m) ?? [])[1];
if (!connectionString) {
  console.error("DATABASE_URL not found in .env.local");
  process.exit(1);
}

const client = new pg.Client({ connectionString, ssl: { rejectUnauthorized: false } });
await client.connect();
await client.query("begin read only");

let failed = 0;
const check = (ok, label, detail = "") => {
  if (!ok) failed++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}${detail ? `  -> ${detail}` : ""}`);
};

try {
  const { rows: noRls } = await client.query(
    `select tablename from pg_tables where schemaname = 'public' and not rowsecurity order by 1`,
  );
  check(noRls.length === 0, "RLS enabled on every public table", noRls.map((r) => r.tablename).join(", "));

  const { rows: writePolicies } = await client.query(
    `select tablename, policyname, cmd from pg_policies
      where schemaname = 'public' and cmd in ('INSERT', 'UPDATE', 'DELETE', 'ALL')
        and (roles && array['anon','authenticated','public']::name[]) order by 1, 2`,
  );
  check(writePolicies.length === 0, "no client-role write policies", writePolicies.map((r) => `${r.tablename}.${r.policyname} (${r.cmd})`).join("; "));

  const { rows: writeGrants } = await client.query(
    `select table_name, grantee, string_agg(privilege_type, ',' order by privilege_type) as privs
       from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')
        and privilege_type in ('INSERT', 'UPDATE', 'DELETE', 'TRUNCATE')
      group by 1, 2 order by 1, 2`,
  );
  check(writeGrants.length === 0, "no INSERT/UPDATE/DELETE/TRUNCATE grants to anon/authenticated", writeGrants.map((r) => `${r.table_name}:${r.grantee}(${r.privs})`).join("; "));

  const { rows: secretReads } = await client.query(
    `select table_name, grantee from information_schema.role_table_grants
      where table_schema = 'public' and grantee in ('anon', 'authenticated')
        and table_name in ('otp_codes', 'ai_cache', 'schema_migrations') group by 1, 2`,
  );
  check(secretReads.length === 0, "otp_codes / ai_cache / schema_migrations not granted to clients", secretReads.map((r) => `${r.table_name}:${r.grantee}`).join("; "));

  const { rows: isAdminExec } = await client.query(
    `select has_function_privilege('anon', 'public.is_admin(uuid)', 'execute') as anon,
            has_function_privilege('authenticated', 'public.is_admin(uuid)', 'execute') as auth`,
  );
  check(!isAdminExec[0].anon && !isAdminExec[0].auth, "is_admin(uuid) not callable by clients");

  // Tamper checks - informational; a human decides whether a value is legitimate.
  const { rows: roles } = await client.query(`select coalesce(role, '(none)') as role, count(*)::int as n from profiles group by 1 order by 1`);
  console.log(`INFO  profiles by role: ${roles.map((r) => `${r.role}=${r.n}`).join(", ")}`);
  const { rows: rich } = await client.query(
    `select p.id, p.points_balance,
            coalesce((select sum(amount) from points_transactions t where t.user_id = p.id), 0)::int as ledger_sum
       from profiles p order by p.points_balance desc limit 10`,
  );
  // Every profile starts at the column default (100); no 'starting_grant' row is ever written
  // (grep src/ and pipeline/), so the expected balance is 100 + the ledger's net movements.
  console.log("INFO  top balances vs 100 + points ledger (a mismatch is worth a look):");
  for (const r of rich) {
    const expected = 100 + r.ledger_sum;
    console.log(`      ${r.id}  balance=${r.points_balance}  expected=${expected}${r.points_balance !== expected ? "  <-- mismatch" : ""}`);
  }
  const { rows: admins } = await client.query(
    `select m.group_id, count(*)::int as admins,
            count(*) filter (where m.user_id <> g.created_by)::int as non_creator_admins
       from group_members m join groups g on g.id = m.group_id
      where m.role = 'admin' group by 1 having count(*) filter (where m.user_id <> g.created_by) > 0`,
  );
  console.log(`INFO  groups with admins other than their creator: ${admins.length}${admins.length ? " (" + admins.map((a) => `${a.group_id}:${a.non_creator_admins}`).join(", ") + ")" : ""}`);
} finally {
  await client.query("rollback").catch(() => {});
  await client.end();
}

process.exitCode = failed ? 1 : 0;
