#!/usr/bin/env node
// Synthetic seed for STAGING ONLY (audit R-12): 4 users, 2 communities, posts, and prediction rounds that
// are open, locked and resolved, made through the app's own lifecycle functions (enter_prediction,
// lock_due_predictions, settle_prediction) so staging exercises the real rules. Needs the F1 reference data
// first (copy-reference-data.mjs). Refuses to run against any other project. Idempotent: reruns reuse what
// exists. Users are created through Supabase's admin API with pre-confirmed @seed.invalid addresses (no
// inbox needed); their shared password comes from STAGING_SEED_PASSWORD and is never printed.
//
//   STAGING_DATABASE_URL=... STAGING_SUPABASE_URL=... STAGING_SUPABASE_SECRET_KEY=... STAGING_SEED_PASSWORD=... node scripts/staging/seed.mjs
import pg from "pg";
import { USERS, seedApp } from "./seed-app.mjs";
const { Client } = pg;
const STAGING_REF = process.env.STAGING_PROJECT_REF ?? "wmdgbmlpvszyapewygvs";
const dbUrl = process.env.STAGING_DATABASE_URL, apiUrl = process.env.STAGING_SUPABASE_URL, secret = process.env.STAGING_SUPABASE_SECRET_KEY, password = process.env.STAGING_SEED_PASSWORD;
if (!dbUrl || !apiUrl || !secret || !password) throw new Error("set STAGING_DATABASE_URL, STAGING_SUPABASE_URL, STAGING_SUPABASE_SECRET_KEY and STAGING_SEED_PASSWORD");
if (new URL(dbUrl).username.split(".")[1] !== STAGING_REF || !apiUrl.includes(STAGING_REF)) throw new Error("not the staging project; refusing");

const api = async (method, path, body) => {
  const res = await fetch(`${apiUrl}${path}`, { method, headers: { apikey: secret, authorization: `Bearer ${secret}`, "content-type": "application/json" }, body: body ? JSON.stringify(body) : undefined });
  const text = await res.text();
  if (!res.ok) throw new Error(`${method} ${path} -> ${res.status} ${text.slice(0, 160)}`);
  return text ? JSON.parse(text) : null;
};
{
  const existing = (await api("GET", "/auth/v1/admin/users?per_page=200")).users ?? [];
  for (const u of USERS) {
    const found = existing.find((e) => e.email === u.email);
    u.id = found ? found.id : (await api("POST", "/auth/v1/admin/users", { email: u.email, password, email_confirm: true, user_metadata: { seed: true } })).id;
  }
  const c = new Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await c.connect();
  await c.query("begin");
  try {
    const { fans, league } = await seedApp(c);
    await c.query("commit");
    const bal = (await c.query(`select username, points_balance from profiles where username like 'seed_%' order by username`)).rows;
    console.log("balances:", bal.map((b) => `${b.username}=${b.points_balance}`).join(" "));
    console.log("seed ok: users", USERS.length, "| groups 2");
    console.log(JSON.stringify({ users: USERS.map(({ key, id: uid, email }) => ({ key, id: uid, email })), groups: { fans, league } }));
  } catch (e) {
    await c.query("rollback").catch(() => {});
    console.log("SEED FAILED, rolled back:", e.message);
    process.exitCode = 1;
  } finally { await c.end(); }
}
