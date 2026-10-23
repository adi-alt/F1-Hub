// Regression tests for supabase/migrations/20261028_post_moderation.sql (reports, the moderation log, edit/delete
// columns).

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, seedUser, type TestDb } from "./testDb";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const AUTHOR = uid(1);
const READER = uid(2);
const GROUP = uid(100);
const POST = uid(200);
const COMMENT = uid(300);

describe("post moderation", () => {
  let t: TestDb;
  before(async () => {
    t = await createTestDb();
    await seedUser(t, AUTHOR);
    await seedUser(t, READER);
    await t.owner(`insert into groups (id, name, created_by, visibility) values ($1, 'Club', $2, 'public')`, [GROUP, AUTHOR]);
    await t.owner(`insert into group_posts (id, group_id, user_id, content) values ($1, $2, $3, 'Norris takes it')`, [POST, GROUP, AUTHOR]);
    await t.owner(`insert into group_post_comments (id, post_id, user_id, content) values ($1, $2, $3, 'No chance')`, [COMMENT, POST, READER]);
  });
  after(() => t.close());

  const report = (role: "authenticated" | "service_role", commentId: string | null = null) =>
    t.as(role, READER, `insert into group_post_reports (group_id, post_id, comment_id, reporter_id, reason) values ($1, $2, $3, $4, 'spam')`, [GROUP, POST, commentId, READER]);

  test("clients can neither read nor write reports or the log; the server can", async () => {
    await assert.rejects(report("authenticated"), /permission denied/);
    await assert.rejects(t.as("authenticated", READER, `select * from group_moderation_log`), /permission denied/);
    await report("service_role");
    await t.as("service_role", AUTHOR, `insert into group_moderation_log (group_id, actor_id, action, post_id) values ($1, $2, 'post_removed', $3)`, [GROUP, AUTHOR, POST]);
    assert.equal((await t.as("service_role", null, `select id from group_moderation_log`)).length, 1);
  });

  test("one report per person per post or comment", async () => {
    await assert.rejects(report("service_role"), /duplicate key/);
    await report("service_role", COMMENT);
    await assert.rejects(report("service_role", COMMENT), /duplicate key/);
  });

  test("statuses and actions are a closed set", async () => {
    await assert.rejects(t.owner(`update group_post_reports set status = 'maybe'`), /group_post_reports_status_check/);
    await assert.rejects(t.owner(`insert into group_moderation_log (group_id, action) values ($1, 'banned_everyone')`, [GROUP]), /group_moderation_log_action_check/);
  });

  test("a comment can be tombstoned and edited; the log outlives a deleted post", async () => {
    await t.owner(`update group_post_comments set deleted_at = now(), content = '[deleted]', edited_at = now() where id = $1`, [COMMENT]);
    await t.owner(`update group_posts set edited_at = now() where id = $1`, [POST]);
    await t.owner(`delete from group_posts where id = $1`, [POST]);
    assert.equal((await t.owner(`select id from group_post_reports`)).length, 0);
    assert.equal((await t.owner(`select id from group_moderation_log`)).length, 1);
  });
});
