#!/usr/bin/env node
// A normalised fingerprint of a database's public schema: tables, columns, constraints, indexes, RLS
// flags, policies, functions, triggers, views and the client-role grants (everything inside
// `begin read only`). It is the drift check (audit R-12):
//
//   node scripts/schema-fingerprint.mjs --write     rewrite supabase/schema.fingerprint.json from DATABASE_URL
//   node scripts/schema-fingerprint.mjs --check     fail if DATABASE_URL's schema differs from that file
//
// CI writes nothing: the staging job checks that a database built from the migrations equals the
// committed file (so a PR that changes the schema must update it), and the production job, after its
// approval and migrations, checks production against the same file. Differences that are known and
// explained live in supabase/schema.drift-allowlist.json; anything else fails the job.
import fs from "node:fs";
import { connect } from "./lib/db.mjs";

const FILE = new URL("../supabase/schema.fingerprint.json", import.meta.url);
const ALLOWLIST = new URL("../supabase/schema.drift-allowlist.json", import.meta.url);

const QUERIES = {
  tables: `select table_name as k, table_type as v from information_schema.tables where table_schema='public'`,
  columns: `select table_name||'.'||column_name as k, data_type||' null='||is_nullable||' default='||coalesce(regexp_replace(column_default,'nextval\\(.*','nextval'),'') as v from information_schema.columns where table_schema='public'`,
  constraints: `select conrelid::regclass::text||'.'||conname as k, pg_get_constraintdef(oid) as v from pg_constraint where connamespace='public'::regnamespace`,
  // The one-per-round index carries the timestamp of the moment its migration ran: normalised away.
  indexes: `select indexname as k, regexp_replace(regexp_replace(indexdef,'^CREATE (UNIQUE )?INDEX \\S+ ','CREATE \\1INDEX '), '''\\d{4}-\\d{2}-\\d{2} [0-9:.]+\\+00''::timestamp with time zone', '<migration-time>') as v from pg_indexes where schemaname='public'`,
  rls: `select relname as k, relrowsecurity::text||' force='||relforcerowsecurity::text as v from pg_class where relnamespace='public'::regnamespace and relkind='r'`,
  policies: `select tablename||'.'||policyname as k, cmd||' roles='||roles::text||' using='||coalesce(qual,'')||' check='||coalesce(with_check,'') as v from pg_policies where schemaname='public'`,
  functions: `select p.oid::regprocedure::text as k, md5(pg_get_functiondef(p.oid)) as v from pg_proc p where pronamespace='public'::regnamespace and prokind in ('f','p')`,
  triggers: `select tgrelid::regclass::text||'.'||tgname as k, md5(pg_get_triggerdef(oid)) as v from pg_trigger where not tgisinternal and tgrelid::regclass::text not like 'pg_%'`,
  views: `select viewname as k, md5(definition) as v from pg_views where schemaname='public'`,
  grants: `select table_name||' '||grantee||' '||privilege_type as k, '' as v from information_schema.role_table_grants where table_schema='public' and grantee in ('anon','authenticated','service_role')`,
};

async function fingerprint() {
  const client = await connect();
  try {
    await client.query("begin read only");
    const out = {};
    for (const [name, sql] of Object.entries(QUERIES)) {
      const rows = (await client.query(sql)).rows.sort((a, b) => (a.k < b.k ? -1 : a.k > b.k ? 1 : 0));
      out[name] = Object.fromEntries(rows.map((r) => [r.k, r.v]));
    }
    await client.query("rollback");
    return out;
  } finally {
    await client.end();
  }
}

const mode = process.argv.includes("--write") ? "write" : "check";
const actual = await fingerprint();

if (mode === "write") {
  fs.writeFileSync(FILE, `${JSON.stringify(actual, null, 1)}\n`);
  console.log(`wrote supabase/schema.fingerprint.json: ${Object.values(actual).reduce((n, s) => n + Object.keys(s).length, 0)} entries`);
  process.exit(0);
}

const expected = JSON.parse(fs.readFileSync(FILE, "utf8"));
const allow = fs.existsSync(ALLOWLIST) ? JSON.parse(fs.readFileSync(ALLOWLIST, "utf8")) : [];
const allowed = (section, key) => allow.find((a) => key.includes(a.contains) && (!a.sections || a.sections.includes(section)));
const problems = [];
const usedAllow = new Set();
for (const section of Object.keys(QUERIES)) {
  const e = expected[section] ?? {};
  const a = actual[section] ?? {};
  for (const key of new Set([...Object.keys(e), ...Object.keys(a)])) {
    const what = !(key in a) ? "missing from the database" : !(key in e) ? "not in the committed fingerprint" : e[key] !== a[key] ? "differs from the committed fingerprint" : null;
    if (!what) continue;
    const rule = allowed(section, key);
    if (rule) usedAllow.add(rule);
    else problems.push(`${section}: ${key} ${what}`);
  }
}
for (const rule of allow) if (!usedAllow.has(rule)) console.log(`note: allowlist entry "${rule.contains}" no longer matches a difference (${rule.reason}) - it can be removed`);
if (problems.length) {
  console.error(`schema drift: ${problems.length} difference(s) from supabase/schema.fingerprint.json\n  ${problems.slice(0, 40).join("\n  ")}`);
  console.error("\nIf a migration changed the schema on purpose, run `node scripts/schema-fingerprint.mjs --write` against a staging database built from the migrations and commit the file.");
  process.exit(1);
}
console.log(`schema matches the committed fingerprint (${[...usedAllow].length} allowlisted difference(s) ignored)`);
