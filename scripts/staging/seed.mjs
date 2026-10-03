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
const { Client } = pg;
const STAGING_REF = process.env.STAGING_PROJECT_REF ?? "wmdgbmlpvszyapewygvs";
const dbUrl = process.env.STAGING_DATABASE_URL, apiUrl = process.env.STAGING_SUPABASE_URL, secret = process.env.STAGING_SUPABASE_SECRET_KEY, password = process.env.STAGING_SEED_PASSWORD;
if (!dbUrl || !apiUrl || !secret || !password) throw new Error("set STAGING_DATABASE_URL, STAGING_SUPABASE_URL, STAGING_SUPABASE_SECRET_KEY and STAGING_SEED_PASSWORD");
if (new URL(dbUrl).username.split(".")[1] !== STAGING_REF || !apiUrl.includes(STAGING_REF)) throw new Error("not the staging project; refusing");

const USERS = [
  { key: "alex", email: "seed-alex@seed.invalid", first: "Alex", last: "Seed", username: "seed_alex", role: "admin", drivers: ["hamilton", "norris"], teams: ["ferrari"], tracks: ["monza"], onboarded: true },
  { key: "blair", email: "seed-blair@seed.invalid", first: "Blair", last: "Seed", username: "seed_blair", role: "moderator", drivers: ["max_verstappen"], teams: ["red_bull"], tracks: [], onboarded: true },
  { key: "casey", email: "seed-casey@seed.invalid", first: "Casey", last: "Seed", username: "seed_casey", role: null, drivers: [], teams: [], tracks: [], onboarded: false },
  { key: "dana", email: "seed-dana@seed.invalid", first: "Dana", last: "Seed", username: "seed_dana", role: null, drivers: ["leclerc"], teams: ["ferrari"], tracks: ["silverstone"], onboarded: true },
];
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
    for (const u of USERS) {
      await c.query(
        `insert into profiles (id, email, display_name, role, first_name, last_name, username, favorite_drivers, favorite_teams, favorite_tracks, onboarding_completed_at, points_balance)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,1000)
         on conflict (id) do update set display_name=excluded.display_name, role=excluded.role, favorite_drivers=excluded.favorite_drivers, favorite_teams=excluded.favorite_teams, favorite_tracks=excluded.favorite_tracks`,
        [u.id, u.email, `${u.first} Seed`, u.role, u.first, u.last, u.username, u.drivers, u.teams, u.tracks, u.onboarded ? new Date().toISOString() : null],
      );
      await c.query(`insert into points_transactions (user_id, amount, reason) select $1, 1000, 'starting_grant' where not exists (select 1 from points_transactions where user_id=$1 and reason='starting_grant')`, [u.id]);
    }
    const id = Object.fromEntries(USERS.map((u) => [u.key, u.id]));
    const group = async (name, over) => {
      const ex = await c.query("select id from groups where name=$1", [name]);
      if (ex.rows[0]) return ex.rows[0].id;
      return (await c.query(
        `insert into groups (name, created_by, description, visibility, community_type, topic, tags, tagline, moderation_enabled) values ($1,$2,$3,$4,$5,'Formula 1',$6,$7,$8) returning id`,
        [name, id.alex, over.description, over.visibility, over.type, over.tags, over.tagline, over.moderation],
      )).rows[0].id;
    };
    const fans = await group("Seed F1 Fans", { description: "A public synthetic community for staging.", visibility: "public", type: "f1", tags: ["f1", "seed"], tagline: "Race-weekend talk", moderation: true });
    const league = await group("Seed Prediction League", { description: "A private synthetic league for staging.", visibility: "private", type: "prediction_league", tags: ["league"], tagline: "Weekly picks", moderation: false });
    const members = [[fans, "alex", "admin"], [fans, "blair", "moderator"], [fans, "casey", "member"], [fans, "dana", "member"], [league, "alex", "admin"], [league, "blair", "member"], [league, "dana", "member"]];
    for (const [g, k, role] of members) await c.query(`insert into group_members (group_id, user_id, role) values ($1,$2,$3) on conflict do nothing`, [g, id[k], role]);

    const post = async (g, k, kind, status, title, content, extra = {}) => {
      const ex = await c.query("select id from group_posts where group_id=$1 and title=$2", [g, title]);
      if (ex.rows[0]) return ex.rows[0].id;
      return (await c.query(`insert into group_posts (group_id, user_id, kind, status, title, content, scheduled_at) values ($1,$2,$3,$4,$5,$6,$7) returning id`, [g, id[k], kind, status, title, content, extra.scheduledAt ?? null])).rows[0].id;
    };
    const p1 = await post(fans, "alex", "race_discussion", "published", "Sepang under the lights?", "Qualifying is done. Who looks quickest for Sunday?");
    await post(fans, "dana", "question", "published", "Best overtaking spot at this circuit?", "Turn 1 or the back straight, what do you think?");
    await post(fans, "casey", "discussion", "pending", "Waiting for approval", "A post held by moderation for the staging pass.");
    await post(fans, "blair", "announcement", "scheduled", "Scheduled announcement", "Goes out later.", { scheduledAt: new Date(Date.now() + 86400000).toISOString() });
    if (!(await c.query("select 1 from group_post_comments where post_id=$1", [p1])).rows[0]) {
      const first = (await c.query(`insert into group_post_comments (post_id, user_id, content) values ($1,$2,'Pole looked tight, I would not bet against it.') returning id`, [p1, id.dana])).rows[0].id;
      await c.query(`insert into group_post_comments (post_id, user_id, content, parent_comment_id) values ($1,$2,'Agreed, the long run pace matters more.',$3)`, [p1, id.blair, first]);
    }

    // Prediction rounds: r15 finished (resolved), r16 qualifying has passed (locked), r23 not yet (open).
    const R15 = "2026_r15_azerbaijan-grand-prix", R16 = "2026_r16_bahrain-grand-prix", R23 = "2026_r23_abu-dhabi-grand-prix";
    const round = async (g, race, type, pts, createdAt) => {
      const ex = await c.query("select id from group_predictions where group_id=$1 and race_id=$2 and type=$3", [g, race, type]);
      if (ex.rows[0]) return { id: ex.rows[0].id, fresh: false };
      return { id: (await c.query(`insert into group_predictions (group_id, race_id, type, entry_points, created_by, created_at) values ($1,$2,$3,$4,$5,$6) returning id`, [g, race, type, pts, id.alex, createdAt])).rows[0].id, fresh: true };
    };
    const enter = (r, g, k, guess, now) => c.query(`select * from enter_prediction($1,$2,$3,$4::jsonb,$5)`, [r.id, g, id[k], JSON.stringify(guess), now]);
    const r15 = await round(league, R15, "winner", 100, "2026-09-18T10:00:00Z");
    const r16 = await round(league, R16, "winner", 100, "2026-09-28T10:00:00Z");
    const r23 = await round(league, R23, "podium", 50, "2026-10-01T10:00:00Z");
    await round(fans, R23, "winner", 25, "2026-10-01T10:00:00Z"); // an open round nobody has entered yet
    if (r15.fresh) for (const [k, v] of [["alex", "RUS"], ["blair", "VER"], ["dana", "HAD"]]) await enter(r15, league, k, v, "2026-09-20T12:00:00Z");
    if (r16.fresh) for (const [k, v] of [["alex", "NOR"], ["blair", "HAM"], ["dana", "ANT"]]) await enter(r16, league, k, v, "2026-10-01T12:00:00Z");
    if (r23.fresh) await enter(r23, league, "alex", ["VER", "NOR", "RUS"], new Date().toISOString());
    await c.query("select lock_due_predictions()");
    if (r15.fresh) {
      await c.query(`select * from settle_prediction($1,$2,'"RUS"'::jsonb,'official')`, [r15.id, league]);
      const scores = [["alex", 1, 3], ["blair", 2, 0], ["dana", 3, 0]];
      for (const [k, rank, score] of scores) await c.query(`insert into group_race_scores (group_id, race_id, user_id, score, rank) values ($1,$2,$3,$4,$5) on conflict do nothing`, [league, R15, id[k], score, rank]);
    }
    for (const [k, w, pod] of [["alex", "RUS", ["RUS", "VER", "HAD"]], ["blair", "VER", ["VER", "RUS", "HAD"]], ["dana", "HAD", ["HAD", "RUS", "VER"]]]) await c.query(`insert into picks (user_id, race_id, predicted_winner, predicted_podium) values ($1,$2,$3,$4) on conflict do nothing`, [id[k], R15, w, pod]);
    await c.query(`insert into picks (user_id, race_id, predicted_winner, predicted_podium) values ($1,$2,'NOR','{NOR,HAM,ANT}') on conflict do nothing`, [id.alex, R16]);

    await c.query("commit");
    const states = (await c.query(`select race_id, type, status, (select count(*)::int from group_prediction_entries e where e.prediction_id=p.id) entries from group_predictions p order by race_id, type`)).rows;
    console.log("rounds:", states.map((s) => `${s.race_id.slice(5, 8)} ${s.type} ${s.status} (${s.entries} entries)`).join(" | "));
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
