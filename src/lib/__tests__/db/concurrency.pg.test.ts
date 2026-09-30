// RACE-CONDITION tests for the prediction lifecycle, invitations, race ingestion and email OTP, against a REAL Postgres with
// genuinely concurrent connections (PGlite, used by the other db suites, runs one statement at a time
// and cannot interleave transactions).
//
// Opt-in: set TEST_DATABASE_URL to a DISPOSABLE Postgres server the connecting user can create
// databases on - e.g. a local `postgres` / Docker container, or a CI service container:
//
//   TEST_DATABASE_URL=postgres://postgres@127.0.0.1:5432/postgres npm test
//
// Safety: the suite creates its own throwaway database (apex_race_<random>), loads the schema into it,
// and drops it at the end. It never reads or writes the database named in the URL, never reads
// DATABASE_URL, and refuses to run against a Supabase-hosted URL at all. Without TEST_DATABASE_URL
// every test here is reported as skipped (never silently passed).

import { after, before, describe, test as nodeTest } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import pg from "pg";
import { loadAppSchema } from "./schemaLoader";

const BASE_URL = process.env.TEST_DATABASE_URL;
const SKIP_REASON = BASE_URL ? false : "set TEST_DATABASE_URL to a disposable Postgres server to run the race-condition tests";

if (BASE_URL && /supabase\.(co|com|net)|pooler\./i.test(BASE_URL)) {
  throw new Error("TEST_DATABASE_URL points at a Supabase-hosted database. These tests create and drop databases; use a disposable local or CI Postgres instead.");
}

// Skipped per TEST (not per suite) so every one of them shows up in the runner's "skipped" count -
// a skipped suite is reported with its reason but its tests aren't counted, which reads as "0 skipped".
const test = (name: string, fn: () => Promise<void>) => (SKIP_REASON ? nodeTest(name, { skip: SKIP_REASON }, fn) : nodeTest(name, fn));

const DB_NAME = `apex_race_${randomUUID().replace(/-/g, "").slice(0, 12)}`;
const clients: pg.Client[] = [];
let admin: pg.Client;

function urlFor(database: string): string {
  const url = new URL(BASE_URL!);
  url.pathname = `/${database}`;
  return url.toString();
}

/** A new connection to the throwaway database, acting as the server (service_role). */
async function session(): Promise<pg.Client> {
  const c = new pg.Client({ connectionString: urlFor(DB_NAME) });
  await c.connect();
  await c.query("set role service_role");
  clients.push(c);
  return c;
}

/** Waits until the backend `pid` is blocked on a lock - proof the two transactions really collided,
 * rather than a sleep that hopes they did. */
async function waitUntilBlocked(pid: number, timeoutMs = 5000): Promise<void> {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const { rows } = await admin.query(`select wait_event_type from pg_stat_activity where pid = $1`, [pid]);
    if (rows[0]?.wait_event_type === "Lock") return;
    await new Promise((r) => setTimeout(r, 20));
  }
  throw new Error(`backend ${pid} never blocked on a lock`);
}
const pidOf = async (c: pg.Client) => (await c.query("select pg_backend_pid() as pid")).rows[0].pid as number;

const uid = () => randomUUID();
const QUALI_FUTURE = "2999-01-01T12:00:00";

async function user(points = 100): Promise<string> {
  const id = uid();
  await admin.query(`insert into auth.users (id) values ($1)`, [id]);
  await admin.query(`insert into profiles (id, points_balance) values ($1, $2)`, [id, points]);
  return id;
}
async function group(members: string[]): Promise<string> {
  const id = uid();
  await admin.query(`insert into groups (id, name, created_by, visibility) values ($1, $2, $3, 'private')`, [id, `g-${id.slice(0, 8)}`, members[0]]);
  for (const [i, m] of members.entries()) await admin.query(`insert into group_members (group_id, user_id, role) values ($1, $2, $3)`, [id, m, i === 0 ? "admin" : "member"]);
  return id;
}
let roundNo = 0;
async function race(): Promise<string> {
  roundNo += 1;
  const id = `2999_r${roundNo}_race-${roundNo}`; // one event per round: races_year_event_key
  await admin.query(`insert into races (id, year, round, name, circuit, status) values ($1, 2999, $2, 'Race', 'Somewhere', 'upcoming')`, [id, roundNo]);
  await admin.query(`insert into calendar (id, year, round, sessions) values ($1, 2999, $2, $3::jsonb)`, [id, roundNo, JSON.stringify([{ label: "Qualifying", date: QUALI_FUTURE }, { label: "Race", date: "2999-01-02T12:00:00" }])]);
  return id;
}
async function prediction(groupId: string, raceId: string, entryPoints = 10, type = "winner"): Promise<string> {
  const id = uid();
  await admin.query(`insert into group_predictions (id, group_id, race_id, type, entry_points, created_by) values ($1, $2, $3, $4, $5, (select user_id from group_members where group_id = $2 and role = 'admin' limit 1))`, [id, groupId, raceId, type, entryPoints]);
  return id;
}
const balance = async (u: string) => (await admin.query(`select points_balance from profiles where id = $1`, [u])).rows[0].points_balance as number;
const ledgerRows = async (u: string, p: string, reason: string) => (await admin.query(`select amount from points_transactions where user_id = $1 and prediction_id = $2 and reason = $3`, [u, p, reason])).rows;

const enterSql = `select enter_prediction($1::uuid, $2::uuid, $3::uuid, $4::jsonb) as r`;
const settleSql = `select settle_prediction($1::uuid, $2::uuid, $3::jsonb, 'official') as r`;

describe("concurrency against a real Postgres", () => {
  before(async () => {
    if (SKIP_REASON) return;
    admin = new pg.Client({ connectionString: BASE_URL });
    await admin.connect();
    await admin.query(`create database ${DB_NAME}`);
    await admin.end();

    admin = new pg.Client({ connectionString: urlFor(DB_NAME) });
    await admin.connect();
    await loadAppSchema((sql) => admin.query(sql));
  });

  after(async () => {
    if (SKIP_REASON) return;
    await Promise.allSettled(clients.map((c) => c.end()));
    await admin?.end().catch(() => {});
    const root = new pg.Client({ connectionString: BASE_URL });
    await root.connect();
    await root.query(`drop database if exists ${DB_NAME} with (force)`);
    await root.end();
  });

  test("DUPLICATE RESOLUTION: eight simultaneous settle calls pay each winner exactly once", async () => {
    const [a, b, c] = [await user(), await user(), await user()];
    const g = await group([a, b, c]);
    const p = await prediction(g, await race(), 10);
    const e = await session();
    for (const [u, guess] of [[a, "VER"], [b, "VER"], [c, "NOR"]] as const) await e.query(enterSql, [p, g, u, JSON.stringify(guess)]);
    const before = { a: await balance(a), b: await balance(b), c: await balance(c) };

    const sessions = await Promise.all(Array.from({ length: 8 }, () => session()));
    const results = await Promise.all(sessions.map((s) => s.query(settleSql, [p, g, JSON.stringify("VER")]).then((r) => r.rows[0].r as { alreadyResolved: boolean; paidTotal: number })));

    assert.equal(results.filter((r) => !r.alreadyResolved).length, 1, "exactly one call settled the round");
    assert.equal(results.filter((r) => r.alreadyResolved).length, 7);
    assert.equal(results.reduce((sum, r) => sum + r.paidTotal, 0), 40, "20 each to the two winners, once");
    assert.equal(await balance(a), before.a + 20);
    assert.equal(await balance(b), before.b + 20);
    assert.equal(await balance(c), before.c);
    assert.equal((await ledgerRows(a, p, "prediction_payout")).length, 1);
    assert.equal((await ledgerRows(b, p, "prediction_payout")).length, 1);
  });

  test("NEGATIVE CONTROL: the same harness catches a naive check-then-act settlement paying twice", async () => {
    // What the old TypeScript resolve did, as SQL: read the status, then pay, then mark resolved -
    // with no row lock. Created only in this throwaway database. The sleep widens the window the old
    // code had across its N network round trips. If THIS doesn't double-pay under the same concurrent
    // load, the test above would be proving nothing.
    await admin.query(`
      create function naive_settle(p_id uuid, p_answer jsonb) returns void language plpgsql as $$
      declare st text; e record;
      begin
        select status into st from group_predictions where id = p_id;
        if st = 'resolved' then return; end if;
        perform pg_sleep(0.2);
        for e in select user_id, guess, points_wagered from group_prediction_entries where prediction_id = p_id loop
          if e.guess = p_answer then
            update profiles set points_balance = points_balance + e.points_wagered * 2 where id = e.user_id;
          end if;
        end loop;
        update group_predictions set status = 'resolved' where id = p_id;
      end $$;
      grant execute on function naive_settle(uuid, jsonb) to service_role;`);
    const [owner, u] = [await user(), await user()];
    const g = await group([owner, u]);
    const p = await prediction(g, await race(), 10);
    await (await session()).query(enterSql, [p, g, u, '"VER"']);
    const before = await balance(u);
    const sessions = await Promise.all(Array.from({ length: 4 }, () => session()));
    await Promise.all(sessions.map((s) => s.query(`select naive_settle($1::uuid, '"VER"'::jsonb)`, [p])));
    assert.ok((await balance(u)) - before > 20, `the naive version paid ${(await balance(u)) - before}, i.e. more than once - so the harness does detect this race`);
  });

  test("DOUBLE SUBMIT: two simultaneous first entries by the same user charge exactly once", async () => {
    const [owner, u] = [await user(), await user(100)];
    const g = await group([owner, u]);
    const p = await prediction(g, await race(), 10);
    const [s1, s2] = [await session(), await session()];
    const [r1, r2] = await Promise.all([s1.query(enterSql, [p, g, u, '"VER"']), s2.query(enterSql, [p, g, u, '"NOR"'])]);
    const created = [r1.rows[0].r.created, r2.rows[0].r.created];
    assert.deepEqual(created.sort(), [false, true], "one created the entry, the other became an edit");
    assert.equal(await balance(u), 90, "charged once");
    assert.equal((await ledgerRows(u, p, "prediction_entry")).length, 1);
    assert.equal((await admin.query(`select count(*)::int as n from group_prediction_entries where prediction_id = $1 and user_id = $2`, [p, u])).rows[0].n, 1);
  });

  test("an entry committed while a settlement is waiting is scored and paid (nothing slips through unscored)", async () => {
    const [owner, u] = [await user(), await user()];
    const g = await group([owner, u]);
    const p = await prediction(g, await race(), 10);
    const [entering, settling] = [await session(), await session()];

    await entering.query("begin");
    await entering.query(enterSql, [p, g, u, '"VER"']); // holds FOR SHARE on the round
    const settlePid = await pidOf(settling);
    const settled = settling.query(settleSql, [p, g, '"VER"']); // needs FOR UPDATE: must wait
    await waitUntilBlocked(settlePid);
    await entering.query("commit");
    const res = (await settled).rows[0].r;

    assert.equal(res.alreadyResolved, false);
    assert.equal(res.paidTotal, 20, "the entry that committed while settlement waited was included");
    assert.equal(await balance(u), 100 - 10 + 20);
  });

  test("an entry that arrives while a settlement holds the round is refused once it resolves - no late, unscored entry", async () => {
    const [owner, u, late] = [await user(), await user(), await user()];
    const g = await group([owner, u, late]);
    const p = await prediction(g, await race(), 10);
    const [settling, entering] = [await session(), await session()];
    await settling.query(enterSql, [p, g, u, '"VER"']);

    await settling.query("begin");
    await settling.query(settleSql, [p, g, '"VER"']); // holds FOR UPDATE until commit
    const enterPid = await pidOf(entering);
    const attempt = entering.query(enterSql, [p, g, late, '"VER"']).then(
      () => null,
      (err: Error) => err,
    );
    await waitUntilBlocked(enterPid);
    await settling.query("commit");
    const err = await attempt;

    assert.ok(err, "the late entry was refused");
    assert.match(err!.message, /prediction_resolved/);
    assert.equal(await balance(late), 100, "nothing charged");
    assert.equal((await admin.query(`select count(*)::int as n from group_prediction_entries where prediction_id = $1 and user_id = $2`, [p, late])).rows[0].n, 0);
  });

  test("BALANCE RACE: two simultaneous entries that together exceed the balance - exactly one succeeds, never negative", async () => {
    const [owner, u] = [await user(), await user(15)];
    const g = await group([owner, u]);
    const r = await race();
    const [p1, p2] = [await prediction(g, r, 10, "winner"), await prediction(g, r, 10, "pole")];
    const [s1, s2] = [await session(), await session()];
    const outcomes = await Promise.allSettled([s1.query(enterSql, [p1, g, u, '"VER"']), s2.query(enterSql, [p2, g, u, '"VER"'])]);
    assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
    const rejected = outcomes.find((o) => o.status === "rejected") as PromiseRejectedResult;
    assert.match(String(rejected.reason?.message), /insufficient_points/);
    assert.equal(await balance(u), 5);
    const entries = (await admin.query(`select count(*)::int as n from group_prediction_entries where user_id = $1`, [u])).rows[0].n;
    assert.equal(entries, 1, "the refused entry left no row behind");
  });

  test("a single-use invitation redeemed by two people at once admits exactly one", async () => {
    const [owner, x, y] = [await user(), await user(), await user()];
    const g = await group([owner]);
    const invite = uid();
    await admin.query(`insert into group_invites (id, group_id, created_by, expires_at, max_uses) values ($1, $2, $3, now() + interval '1 day', 1)`, [invite, g, owner]);
    const [s1, s2] = [await session(), await session()];
    const redeemSql = `select redeem_group_invite($1::uuid, $2::uuid, $3::uuid) as r`;
    const outcomes = await Promise.allSettled([s1.query(redeemSql, [g, invite, x]), s2.query(redeemSql, [g, invite, y])]);
    assert.equal(outcomes.filter((o) => o.status === "fulfilled").length, 1);
    assert.match(String((outcomes.find((o) => o.status === "rejected") as PromiseRejectedResult).reason?.message), /invite_exhausted/);
    assert.equal((await admin.query(`select use_count from group_invites where id = $1`, [invite])).rows[0].use_count, 1);
    assert.equal((await admin.query(`select count(*)::int as n from group_members where group_id = $1 and user_id in ($2, $3)`, [g, x, y])).rows[0].n, 1);
  });

  // Email OTP (M0 Batch 3). A holding transaction takes the row lock first, the submissions queue
  // behind it (proven with waitUntilBlocked), and all of them are released at once.
  const otpHash = (code: string) => `${code}`.padEnd(64, "0");
  async function otpContended<T>(email: string, calls: (s: pg.Client) => Promise<T>, n: number): Promise<PromiseSettledResult<T>[]> {
    const holder = await session();
    await holder.query("begin");
    await holder.query(`select 1 from otp_codes where email = $1 for update`, [email]);
    const racers = await Promise.all(Array.from({ length: n }, () => session()));
    // Pids first: a pg client queues queries, so asking a blocked connection for its pid would wait
    // behind the very query that is blocked.
    const pids = await Promise.all(racers.map((c) => pidOf(c)));
    const pending = Promise.allSettled(racers.map((c) => calls(c)));
    for (const pid of pids) await waitUntilBlocked(pid);
    await holder.query("commit");
    const results = await pending;
    // Many connections per test here - release them now rather than at the end of the suite.
    await Promise.allSettled([holder, ...racers].map((c) => c.end()));
    return results;
  }

  test("OTP DOUBLE SUBMIT: ten simultaneous submissions of the right code - exactly one verifies", async () => {
    const email = `racer-${uid()}@example.com`;
    await admin.query(`select otp_issue($1, $2)`, [email, otpHash("123456")]);
    const results = await otpContended(email, (c) => c.query(`select otp_verify($1, $2) as r`, [email, otpHash("123456")]).then((q) => q.rows[0].r as string), 10);
    const values = results.map((r) => (r.status === "fulfilled" ? r.value : "error"));
    assert.equal(values.filter((v) => v === "ok").length, 1, values.join(","));
    assert.equal(values.filter((v) => v === "used").length, 9);
  });

  test("OTP BRUTE FORCE in parallel: twenty simultaneous wrong guesses are all counted - 5 wrong, the rest refused", async () => {
    const email = `racer-${uid()}@example.com`;
    await admin.query(`select otp_issue($1, $2)`, [email, otpHash("123456")]);
    const results = await otpContended(email, (c) => c.query(`select otp_verify($1, $2) as r`, [email, otpHash("999999")]).then((q) => q.rows[0].r as string), 20);
    const values = results.map((r) => (r.status === "fulfilled" ? r.value : "error"));
    assert.equal(values.filter((v) => v === "wrong").length, 5, values.join(","));
    assert.equal(values.filter((v) => v === "too-many").length, 15);
    const { rows } = await admin.query(`select attempts, failures_in_window from otp_codes where email = $1`, [email]);
    assert.deepEqual(rows[0], { attempts: 5, failures_in_window: 5 });
    assert.equal((await admin.query(`select otp_verify($1, $2) as r`, [email, otpHash("123456")])).rows[0].r, "too-many");
  });

  test("OTP simultaneous first requests for one address issue exactly one code", async () => {
    const email = `racer-${uid()}@example.com`;
    const [a, b] = [await session(), await session()];
    const results = await Promise.all([a.query(`select otp_issue($1, $2) as r`, [email, otpHash("111111")]), b.query(`select otp_issue($1, $2) as r`, [email, otpHash("222222")])]);
    assert.deepEqual(results.map((q) => q.rows[0].r.status).sort(), ["cooldown", "issued"]);
  });

  test("OTP complete-signup replay: two simultaneous uses of one verification - exactly one succeeds", async () => {
    const email = `racer-${uid()}@example.com`;
    await admin.query(`select otp_issue($1, $2)`, [email, otpHash("123456")]);
    assert.equal((await admin.query(`select otp_verify($1, $2) as r`, [email, otpHash("123456")])).rows[0].r, "ok");
    const results = await otpContended(email, (c) => c.query(`select otp_consume_verification($1) as r`, [email]).then((q) => q.rows[0].r as boolean), 2);
    assert.deepEqual(results.map((r) => (r.status === "fulfilled" ? r.value : "error")).sort(), [false, true]);
  });

  // Ingestion (M0 Batch 3). The pipeline writes with `insert ... on conflict (id) do update` in
  // autocommit; each side holds its statement's transaction open here only so the interleaving is
  // forced rather than hoped for.
  const upsertRace = `insert into races (id, year, round, name, circuit, status) values ($1, 2998, $2, 'Race', 'Sakhir', 'upcoming')
                      on conflict (id) do update set round = excluded.round, circuit = excluded.circuit`;

  test("SIMULTANEOUS SYNCS, same event: two runs writing the same race converge on one row", async () => {
    const [s1, s2] = [await session(), await session()];
    await s1.query("begin");
    await s1.query(upsertRace, ["2998_r01_same-grand-prix", 1]);
    await s2.query("begin");
    const s2Pid = await pidOf(s2);
    const second = s2.query(upsertRace, ["2998_r01_same-grand-prix", 1]);
    await waitUntilBlocked(s2Pid);
    await s1.query("commit");
    await second;
    await s2.query("commit");
    assert.equal((await admin.query(`select count(*)::int as n from races where year = 2998 and race_slug(id) = 'same-grand-prix'`)).rows[0].n, 1);
  });

  test("SIMULTANEOUS SYNCS, conflicting identity: two different events for one round - exactly one is stored", async () => {
    const [s1, s2] = [await session(), await session()];
    await s1.query("begin");
    await s1.query(upsertRace, ["2998_r02_first-grand-prix", 2]);
    await s2.query("begin");
    const s2Pid = await pidOf(s2);
    const second = s2.query(upsertRace, ["2998_r02_renamed-grand-prix", 2]);
    await waitUntilBlocked(s2Pid);
    await s1.query("commit");
    await assert.rejects(second, /races_year_round_key/);
    await s2.query("rollback");
    assert.deepEqual((await admin.query(`select id from races where year = 2998 and round = 2`)).rows, [{ id: "2998_r02_first-grand-prix" }]);
  });

  test("the scheduled lock and an entry racing it: an entry is either in before the deadline or refused, never both", async () => {
    const [owner, u] = [await user(), await user()];
    const g = await group([owner, u]);
    const r = await race();
    const p = await prediction(g, r, 0);
    // Move the deadline into the past, then race the lock job against an entry.
    await admin.query(`update calendar set sessions = $2::jsonb where id = $1`, [r, JSON.stringify([{ label: "Qualifying", date: "2000-01-01T00:00:00" }])]);
    const [locker, entering] = [await session(), await session()];
    const [lockRes, enterRes] = await Promise.allSettled([locker.query(`select lock_due_predictions()`), entering.query(enterSql, [p, g, u, '"VER"'])]);
    assert.equal(lockRes.status, "fulfilled");
    assert.equal(enterRes.status, "rejected", "past the deadline, entry is refused regardless of whether the lock job ran first");
    assert.match(String((enterRes as PromiseRejectedResult).reason?.message), /prediction_locked/);
    assert.equal((await admin.query(`select status from group_predictions where id = $1`, [p])).rows[0].status, "locked");
  });
});
