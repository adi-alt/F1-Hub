// Regression tests for supabase/migrations/20260929_comment_integrity.sql (audit SEC-12 / COM-14).

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, seedUser, type TestDb } from "./testDb";

const ALICE = "00000000-0000-4000-8000-00000000000a";
const BOB = "00000000-0000-4000-8000-00000000000b";
const PRIVATE_GROUP = "00000000-0000-4000-8000-000000000001";
const PRIVATE_POST = "00000000-0000-4000-8000-0000000000a1";
const PERSONAL_POST = "00000000-0000-4000-8000-0000000000a2";
const PRIVATE_COMMENT = "00000000-0000-4000-8000-0000000000c1";
const PERSONAL_COMMENT = "00000000-0000-4000-8000-0000000000c2";

describe("comment integrity", () => {
  let t: TestDb;
  before(async () => {
    t = await createTestDb();
    await seedUser(t, ALICE);
    await seedUser(t, BOB);
    await t.owner(`insert into groups (id, name, created_by, visibility) values ($1, 'Private club', $2, 'private')`, [PRIVATE_GROUP, BOB]);
    await t.owner(`insert into group_members (group_id, user_id, role) values ($1, $2, 'admin')`, [PRIVATE_GROUP, BOB]);
    await t.owner(`insert into group_posts (id, group_id, user_id, content) values ($1, $2, $3, 'members only')`, [PRIVATE_POST, PRIVATE_GROUP, BOB]);
    await t.owner(`insert into group_posts (id, group_id, user_id, content) values ($1, null, $2, 'personal')`, [PERSONAL_POST, ALICE]);
    await t.owner(`insert into group_post_comments (id, post_id, user_id, content) values ($1, $2, $3, 'secret')`, [PRIVATE_COMMENT, PRIVATE_POST, BOB]);
    await t.owner(`insert into group_post_comments (id, post_id, user_id, content) values ($1, $2, $3, 'hello')`, [PERSONAL_COMMENT, PERSONAL_POST, ALICE]);
  });
  after(() => t.close());

  const vote = (post: string, comment: string, uid: string, dir: number) =>
    t.as<{ cast_comment_vote: number }>("service_role", null, `select cast_comment_vote($1, $2, $3, ${dir}::smallint)`, [post, comment, uid]);

  test("voting on a private community's comment via an unrelated personal post is rejected", async () => {
    await assert.rejects(vote(PERSONAL_POST, PRIVATE_COMMENT, ALICE, 1), /comment_not_in_post/);
    const rows = await t.owner(`select 1 from group_comment_votes where comment_id = $1`, [PRIVATE_COMMENT]);
    assert.equal(rows.length, 0);
  });

  test("a vote on a comment that does belong to the post works, toggles, and switches", async () => {
    assert.equal((await vote(PERSONAL_POST, PERSONAL_COMMENT, BOB, 1))[0].cast_comment_vote, 1);
    assert.equal((await vote(PERSONAL_POST, PERSONAL_COMMENT, BOB, 1))[0].cast_comment_vote, 0, "same direction clears");
    assert.equal((await vote(PERSONAL_POST, PERSONAL_COMMENT, BOB, -1))[0].cast_comment_vote, -1);
    assert.equal((await vote(PERSONAL_POST, PERSONAL_COMMENT, BOB, 1))[0].cast_comment_vote, 1, "opposite direction switches");
    const rows = await t.owner(`select 1 from group_comment_votes where comment_id = $1 and user_id = $2`, [PERSONAL_COMMENT, BOB]);
    assert.equal(rows.length, 1, "never two rows");
  });

  test("an invalid direction is rejected", async () => {
    await assert.rejects(vote(PERSONAL_POST, PERSONAL_COMMENT, BOB, 5), /invalid_direction/);
  });

  test("clients cannot call the vote function directly", async () => {
    await assert.rejects(
      t.as("authenticated", ALICE, `select cast_comment_vote($1, $2, $3, 1::smallint)`, [PERSONAL_POST, PERSONAL_COMMENT, ALICE]),
      /permission denied/,
    );
    await assert.rejects(t.as("anon", null, `select cast_comment_vote($1, $2, $3, 1::smallint)`, [PERSONAL_POST, PERSONAL_COMMENT, ALICE]), /permission denied/);
  });

  test("a reply cannot be attached under a comment on a different post", async () => {
    await assert.rejects(
      t.owner(`insert into group_post_comments (post_id, user_id, content, parent_comment_id) values ($1, $2, 'x', $3)`, [PERSONAL_POST, ALICE, PRIVATE_COMMENT]),
      /parent_comment_not_in_post/,
    );
    await t.owner(`insert into group_post_comments (post_id, user_id, content, parent_comment_id) values ($1, $2, 'ok reply', $3)`, [PERSONAL_POST, BOB, PERSONAL_COMMENT]);
  });
});
