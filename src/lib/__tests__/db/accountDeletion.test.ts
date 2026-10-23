// supabase/migrations/20261029_account_deletion.sql (audit R-53): delete_account removes everything a person owns -
// profile, picks, entries, ledger, notifications, memberships, posts and comments - hands the communities they ran to
// the next member (or deletes one left empty), keeps other people's data, and only the server can call it.

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, seedUser, type TestDb } from "./testDb";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const GONE = uid(1);
const BOB = uid(2);
const CAROL = uid(3);
const SHARED = uid(100); // GONE created it; BOB and CAROL are members
const SOLO = uid(101); // only GONE
const BOBS = uid(102); // BOB's; GONE is a plain member
const RACE = "2026_r01_test";

let t: TestDb;
const count = async (sql: string, params: unknown[] = []) => Number((await t.owner<{ n: number }>(`select count(*)::int as n from ${sql}`, params))[0].n);
const deleteAccount = (user: string) => t.as<{ r: Record<string, unknown> }>("service_role", null, `select delete_account($1::uuid) as r`, [user]);

before(async () => {
  t = await createTestDb();
  for (const u of [GONE, BOB, CAROL]) await seedUser(t, u, { points: 100 });
  await t.owner(`insert into races (id, year, round, name, circuit, status) values ($1, 2026, 1, 'Test GP', 'Sakhir', 'upcoming')`, [RACE]);
  await t.owner(`insert into groups (id, name, created_by) values ($1, 'Shared', $2), ($3, 'Solo', $2), ($4, 'Bobs', $5)`, [SHARED, GONE, SOLO, BOBS, BOB]);
  await t.owner(
    `insert into group_members (group_id, user_id, role, joined_at) values
       ($1, $4, 'admin', '2026-01-01'), ($1, $5, 'member', '2026-02-01'), ($1, $6, 'member', '2026-03-01'),
       ($2, $4, 'admin', '2026-01-01'),
       ($3, $5, 'admin', '2026-01-01'), ($3, $4, 'member', '2026-02-01')`,
    [SHARED, SOLO, BOBS, GONE, BOB, CAROL],
  );
  await t.owner(`insert into group_predictions (id, group_id, race_id, type, created_by) values ($1, $2, $3, 'winner', $4)`, [uid(200), SHARED, RACE, GONE]);
  await t.owner(`insert into group_prediction_entries (prediction_id, user_id, guess, points_wagered) values ($1, $2, '"VER"', 0), ($1, $3, '"NOR"', 0)`, [uid(200), GONE, BOB]);
  await t.owner(`insert into picks (user_id, race_id, predicted_winner, predicted_podium) values ($1, $2, 'VER', '{VER,NOR,LEC}'), ($3, $2, 'NOR', '{NOR,VER,LEC}')`, [GONE, RACE, BOB]);
  await t.owner(`insert into group_posts (id, group_id, user_id, content) values ($1, $3, $4, 'mine'), ($2, $3, $5, 'bobs')`, [uid(300), uid(301), BOBS, GONE, BOB]);
  await t.owner(`insert into group_post_comments (post_id, user_id, content) values ($1, $2, 'my comment on bob'), ($1, $3, 'bob replies'), ($4, $3, 'bob on mine')`, [uid(301), GONE, BOB, uid(300)]);
  await t.owner(`insert into notifications (user_id, kind, title, actor_id) values ($1, 'reply', 'for me', null), ($2, 'reply', 'for bob, from me', $1)`, [GONE, BOB]);
  await t.owner(`insert into group_join_requests (group_id, user_id, status, decided_by) values ($1, $2, 'approved', $3)`, [BOBS, CAROL, GONE]);
});

after(() => t.close());

describe("delete_account", () => {
  test("is not callable by a signed-in user", async () => {
    await assert.rejects(t.as("authenticated", GONE, `select delete_account($1::uuid)`, [GONE]));
  });

  test("deletes the person and everything they own, keeps everyone else's", async () => {
    const [{ r }] = await deleteAccount(GONE);
    assert.deepEqual(r, { alreadyDeleted: false, deletedCommunities: 1, transferredCommunities: 1 });

    assert.equal(await count(`profiles where id = $1`, [GONE]), 0);
    for (const table of ["picks", "group_prediction_entries", "points_transactions", "notifications", "group_members", "group_posts", "group_post_comments"]) {
      assert.equal(await count(`${table} where user_id = $1`, [GONE]), 0, table);
    }
    // Other people's rows survive (their comment on GONE's post goes with that post).
    assert.equal(await count(`group_posts where user_id = $1`, [BOB]), 1);
    assert.equal(await count(`group_post_comments where user_id = $1`, [BOB]), 1);
    assert.equal(await count(`group_prediction_entries where user_id = $1`, [BOB]), 1);
    assert.equal(await count(`picks where user_id = $1`, [BOB]), 1);
    assert.equal(await count(`notifications where user_id = $1 and actor_id is null`, [BOB]), 1);
  });

  test("hands a shared community to the longest-standing member, deletes an empty one", async () => {
    assert.equal(await count(`groups where id = $1`, [SOLO]), 0);
    const [shared] = await t.owner<{ created_by: string }>(`select created_by from groups where id = $1`, [SHARED]);
    assert.equal(shared.created_by, BOB);
    const [bob] = await t.owner<{ role: string }>(`select role from group_members where group_id = $1 and user_id = $2`, [SHARED, BOB]);
    assert.equal(bob.role, "admin");
    const [round] = await t.owner<{ created_by: string }>(`select created_by from group_predictions where id = $1`, [uid(200)]);
    assert.equal(round.created_by, BOB);
    assert.equal(await count(`group_members where group_id = $1`, [BOBS]), 1);
    assert.equal(await count(`group_join_requests where user_id = $1 and status = 'approved' and decided_by is null`, [CAROL]), 1);
  });

  test("a second call changes nothing", async () => {
    const [{ r }] = await deleteAccount(GONE);
    assert.equal(r.alreadyDeleted, true);
  });
});
