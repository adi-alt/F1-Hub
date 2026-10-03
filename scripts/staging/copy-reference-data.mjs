#!/usr/bin/env node
// Copies the PUBLIC F1 reference tables (races, results, laps, drivers, the archive...) from production
// into staging. Production is only ever read (a read-only transaction). The script refuses to write
// unless the target is the staging project, and no user table is in the list: nothing personal is copied.
// archive_laps is limited to the two most recent archive seasons to keep staging small. Tables that
// already have rows in staging are skipped, so it is safe to rerun.
//
//   PRODUCTION_DATABASE_URL=... STAGING_DATABASE_URL=... node scripts/staging/copy-reference-data.mjs
import pg from "pg";
const { Client } = pg;
const prodUrl = process.env.PRODUCTION_DATABASE_URL;
const stgUrl = process.env.STAGING_DATABASE_URL;
if (!prodUrl || !stgUrl) throw new Error("set PRODUCTION_DATABASE_URL and STAGING_DATABASE_URL");
const STAGING_REF = process.env.STAGING_PROJECT_REF ?? "wmdgbmlpvszyapewygvs";
if (new URL(stgUrl).username.split(".")[1] !== STAGING_REF) throw new Error("target is not the staging project; refusing to write");
if (new URL(prodUrl).username.split(".")[1] === STAGING_REF) throw new Error("source is the staging project");

// Parents before children. archive_laps is limited to the two most recent archive seasons.
const TABLES = [
  ["drivers"], ["teams"], ["calendar"], ["model_benchmarks"],
  ["races"], ["race_results"], ["race_inputs"], ["tire_stints"], ["race_laps"],
  ["archive_circuits"], ["archive_drivers"], ["archive_teams"], ["archive_races"],
  ["archive_results"], ["archive_qualifying"], ["archive_pit_stops"],
  ["archive_laps", "archive_race_id in (select id from archive_races where year >= 2024)"],
];
{
  const src = new Client({ connectionString: prodUrl, ssl: { rejectUnauthorized: false } });
  const dst = new Client({ connectionString: stgUrl, ssl: { rejectUnauthorized: false } });
  await src.connect(); await dst.connect();
  await src.query("begin read only");
  for (const [table, where] of TABLES) {
    const have = (await dst.query(`select count(*)::int n from public.${table}`)).rows[0].n;
    if (have > 0) { console.log(`${table.padEnd(20)} skipped (staging already has ${have} rows)`); continue; }
    const rows = (await src.query(`select to_jsonb(t) j from public.${table} t ${where ? "where " + where : ""}`)).rows.map((r) => r.j);
    await dst.query("begin");
    try {
      for (let i = 0; i < rows.length; i += 2000) {
        await dst.query(`insert into public.${table} select * from jsonb_populate_recordset(null::public.${table}, $1::jsonb)`, [JSON.stringify(rows.slice(i, i + 2000))]);
      }
      await dst.query("commit");
      console.log(`${table.padEnd(20)} copied ${rows.length}`);
    } catch (e) {
      await dst.query("rollback");
      console.log(`${table.padEnd(20)} FAILED, rolled back: ${e.message}`);
      break;
    }
  }
  await src.query("rollback"); await src.end(); await dst.end();
}
