// Dump and restore of the irreplaceable data (audit R-27): one JSON document, gzipped, then encrypted
// with age to a PUBLIC key, so the file is safe to keep anywhere and only the holder of the private key
// can read it. Reads happen in one repeatable-read, read-only transaction (a consistent snapshot that
// cannot write).
import zlib from "node:zlib";
import { promisify } from "node:util";
import { Decrypter, Encrypter } from "age-encryption";
import { AUTH_TABLES, IRREPLACEABLE, unclassified } from "./backup-tables.mjs";

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

const ident = (name) => `"${name.replace(/"/g, '""')}"`;
/** An order-independent fingerprint of a table's rows, comparable between a source and its restore. */
const FINGERPRINT = (qualified) => `select count(*)::int as n, coalesce(md5(string_agg(to_jsonb(t)::text, '' order by to_jsonb(t)::text)), md5('')) as h from ${qualified} t`;

export async function listPublicTables(client) {
  return (await client.query(`select tablename from pg_tables where schemaname = 'public' order by 1`)).rows.map((r) => r.tablename);
}

/** Reads every irreplaceable table (and Supabase Auth's users and identities) into one object. */
export async function dump(client) {
  await client.query("begin isolation level repeatable read read only");
  try {
    const missing = unclassified(await listPublicTables(client));
    if (missing.length) {
      throw new Error(`these tables are not classified for backup: ${missing.join(", ")}. Add each to IRREPLACEABLE, REBUILDABLE or EPHEMERAL in scripts/lib/backup-tables.mjs`);
    }
    const tables = {};
    const manifest = {};
    for (const name of IRREPLACEABLE) {
      const exists = (await client.query(`select to_regclass($1) is not null as e`, [`public.${name}`])).rows[0].e;
      if (!exists) continue; // e.g. a table whose migration hasn't reached this database
      tables[name] = (await client.query(`select to_jsonb(t) as j from public.${ident(name)} t`)).rows.map((r) => r.j);
      manifest[name] = (await client.query(FINGERPRINT(`public.${ident(name)}`))).rows[0];
    }
    const auth = {};
    for (const name of AUTH_TABLES) {
      auth[name] = (await client.query(`select to_jsonb(t) as j from auth.${ident(name)} t`)).rows.map((r) => r.j);
    }
    return { version: 1, createdAt: new Date().toISOString(), tables, auth, manifest };
  } finally {
    await client.query("rollback");
  }
}

export async function seal(data, recipient) {
  const encrypter = new Encrypter();
  encrypter.addRecipient(recipient);
  return encrypter.encrypt(await gzip(Buffer.from(JSON.stringify(data))));
}

export async function open(encrypted, identity) {
  const decrypter = new Decrypter();
  decrypter.addIdentity(identity);
  return JSON.parse((await gunzip(Buffer.from(await decrypter.decrypt(encrypted)))).toString("utf8"));
}

/**
 * Restores `data`'s public tables into a SCRATCH schema (never `public`) and checks every table against the
 * fingerprint taken when it was dumped. Foreign keys aren't recreated (rows are loaded table by table),
 * but defaults and check constraints are, from the live table. Returns what it verified.
 */
export async function restoreToScratch(client, data, schema) {
  if (!/^drill_[a-z0-9_]+$/.test(schema)) throw new Error("the scratch schema must be named drill_<something>");
  await client.query(`create schema ${schema}`);
  const results = [];
  try {
    for (const [name, rows] of Object.entries(data.tables)) {
      await client.query(`create table ${schema}.${ident(name)} (like public.${ident(name)} including defaults including constraints)`);
      for (let i = 0; i < rows.length; i += 1000) {
        await client.query(`insert into ${schema}.${ident(name)} select * from jsonb_populate_recordset(null::${schema}.${ident(name)}, $1::jsonb)`, [JSON.stringify(rows.slice(i, i + 1000))]);
      }
      const got = (await client.query(FINGERPRINT(`${schema}.${ident(name)}`))).rows[0];
      const want = data.manifest[name];
      results.push({ table: name, rows: got.n, ok: got.n === want.n && got.h === want.h });
    }
    return results;
  } finally {
    await client.query(`drop schema ${schema} cascade`);
  }
}
