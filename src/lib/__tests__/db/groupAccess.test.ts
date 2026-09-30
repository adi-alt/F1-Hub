// Regression tests for supabase/migrations/20260930_group_access.sql (audit SEC-06 / COM-03).

import { after, before, describe, test } from "node:test";
import assert from "node:assert/strict";
import { createTestDb, seedUser, type TestDb } from "./testDb";

const uid = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const ADMIN = uid(1);
const JOINER = uid(2);
const OTHER = uid(3);
const BANNED = uid(4);
const PUBLIC = uid(100);
const PRIVATE = uid(101);
const HIDDEN = uid(102);
const ANOTHER_PRIVATE = uid(103);

describe("community join authorization", () => {
  let t: TestDb;
  before(async () => {
    t = await createTestDb();
    for (const id of [ADMIN, JOINER, OTHER, BANNED]) await seedUser(t, id);
    for (const [id, name, visibility] of [[PUBLIC, "Open", "public"], [PRIVATE, "Private", "private"], [HIDDEN, "Hidden", "hidden"], [ANOTHER_PRIVATE, "Other private", "private"]]) {
      await t.owner(`insert into groups (id, name, created_by, visibility) values ($1, $2, $3, $4)`, [id, name, ADMIN, visibility]);
      await t.owner(`insert into group_members (group_id, user_id, role) values ($1, $2, 'admin')`, [id, ADMIN]);
      await t.owner(`insert into group_bans (group_id, user_id, banned_by) values ($1, $2, $3)`, [id, BANNED, ADMIN]);
    }
  });
  after(() => t.close());

  const join = (group: string, user: string) => t.as<{ join_group: { joined: boolean; alreadyMember: boolean } }>("service_role", null, `select join_group($1::uuid, $2::uuid) as join_group`, [group, user]);
  const isMember = async (group: string, user: string) => (await t.owner(`select 1 from group_members where group_id = $1 and user_id = $2`, [group, user])).length === 1;

  test("a public community can be joined directly, idempotently", async () => {
    assert.equal((await join(PUBLIC, JOINER))[0].join_group.joined, true);
    assert.equal(await isMember(PUBLIC, JOINER), true);
    assert.deepEqual((await join(PUBLIC, JOINER))[0].join_group, { joined: false, alreadyMember: true });
  });

  test("THE BYPASS: knowing a private or hidden group's id no longer lets anyone join", async () => {
    for (const group of [PRIVATE, HIDDEN]) {
      await assert.rejects(join(group, OTHER), /invite_required/);
      assert.equal(await isMember(group, OTHER), false);
    }
  });

  test("an unknown community is a clean not-found", async () => {
    await assert.rejects(join(uid(999), OTHER), /group_not_found/);
  });

  test("banned users cannot join even a public community", async () => {
    await assert.rejects(join(PUBLIC, BANNED), /banned/);
    assert.equal(await isMember(PUBLIC, BANNED), false);
  });

  test("a removed member can no longer walk back into a private community", async () => {
    await t.owner(`insert into group_members (group_id, user_id, role) values ($1, $2, 'member')`, [PRIVATE, OTHER]);
    await t.owner(`delete from group_members where group_id = $1 and user_id = $2`, [PRIVATE, OTHER]);
    await assert.rejects(join(PRIVATE, OTHER), /invite_required/);
  });

  test("clients cannot call the join functions or read invite / ban state", async () => {
    for (const role of ["anon", "authenticated"] as const) {
      await assert.rejects(t.as(role, OTHER, `select join_group($1::uuid, $2::uuid)`, [PUBLIC, OTHER]), /permission denied/);
      await assert.rejects(t.as(role, OTHER, `select redeem_group_invite($1::uuid, $2::uuid, $3::uuid)`, [PRIVATE, uid(1), OTHER]), /permission denied/);
      for (const table of ["group_invites", "group_bans", "group_invite_redemptions"]) {
        await assert.rejects(t.as(role, ADMIN, `select * from ${table}`), /permission denied/);
      }
    }
  });

  describe("invitations", () => {
    let counter = 0;
    async function invite(group: string, opts: { expiresAt?: string; maxUses?: number; revoked?: boolean } = {}) {
      counter += 1;
      const id = uid(5000 + counter);
      await t.owner(
        `insert into group_invites (id, group_id, created_by, expires_at, max_uses, created_at, revoked_at) values ($1, $2, $3, $4::timestamptz, $5, '2026-01-01T00:00:00Z', $6)`,
        [id, group, ADMIN, opts.expiresAt ?? "2999-01-01T00:00:00Z", opts.maxUses ?? 1, opts.revoked ? "2026-02-01T00:00:00Z" : null],
      );
      return id;
    }
    const redeem = (group: string, inviteId: string, user: string, now?: string) =>
      t.as<{ redeem_group_invite: { joined: boolean; alreadyMember: boolean } }>(
        "service_role",
        null,
        `select redeem_group_invite($1::uuid, $2::uuid, $3::uuid${now ? ", $4::timestamptz" : ""}) as redeem_group_invite`,
        now ? [group, inviteId, user, now] : [group, inviteId, user],
      );
    const uses = async (inviteId: string) => (await t.owner<{ use_count: number }>(`select use_count from group_invites where id = $1`, [inviteId]))[0].use_count;

    test("a valid invitation admits the holder to a private community and consumes a use", async () => {
      const id = await invite(PRIVATE, { maxUses: 3 });
      const fresh = uid(60);
      await seedUser(t, fresh);
      assert.equal((await redeem(PRIVATE, id, fresh))[0].redeem_group_invite.joined, true);
      assert.equal(await isMember(PRIVATE, fresh), true);
      assert.equal(await uses(id), 1);
      assert.equal((await t.owner(`select 1 from group_invite_redemptions where invite_id = $1 and user_id = $2`, [id, fresh])).length, 1);
    });

    test("already a member: success, and no use is consumed", async () => {
      const id = await invite(PRIVATE, { maxUses: 1 });
      assert.deepEqual((await redeem(PRIVATE, id, ADMIN))[0].redeem_group_invite, { joined: false, alreadyMember: true });
      assert.equal(await uses(id), 0);
    });

    test("a single-use invitation works exactly once", async () => {
      const id = await invite(PRIVATE, { maxUses: 1 });
      const [first, second] = [uid(61), uid(62)];
      await seedUser(t, first);
      await seedUser(t, second);
      await redeem(PRIVATE, id, first);
      await assert.rejects(redeem(PRIVATE, id, second), /invite_exhausted/);
      assert.equal(await isMember(PRIVATE, second), false);
      assert.equal(await uses(id), 1);
    });

    test("expiry boundary: valid one millisecond before, invalid at and after the expiry instant", async () => {
      const expiry = Date.parse("2026-11-01T12:00:00Z");
      const id = await invite(PRIVATE, { expiresAt: new Date(expiry).toISOString(), maxUses: 10 });
      const [early, exact, late] = [uid(63), uid(64), uid(65)];
      for (const u of [early, exact, late]) await seedUser(t, u);
      assert.equal((await redeem(PRIVATE, id, early, new Date(expiry - 1).toISOString()))[0].redeem_group_invite.joined, true);
      await assert.rejects(redeem(PRIVATE, id, exact, new Date(expiry).toISOString()), /invite_expired/);
      await assert.rejects(redeem(PRIVATE, id, late, new Date(expiry + 86_400_000).toISOString()), /invite_expired/);
      assert.equal(await isMember(PRIVATE, exact), false);
    });

    test("a revoked invitation stops working immediately", async () => {
      const id = await invite(PRIVATE, { maxUses: 5 });
      const user = uid(66);
      await seedUser(t, user);
      await t.owner(`update group_invites set revoked_at = now() where id = $1`, [id]);
      await assert.rejects(redeem(PRIVATE, id, user), /invite_revoked/);
      assert.equal(await isMember(PRIVATE, user), false);
    });

    test("an invitation is bound to its own community: it cannot be used on another one", async () => {
      const id = await invite(PRIVATE, { maxUses: 5 });
      const user = uid(67);
      await seedUser(t, user);
      await assert.rejects(redeem(ANOTHER_PRIVATE, id, user), /invite_invalid/);
      await assert.rejects(redeem(PRIVATE, uid(424242), user), /invite_invalid/);
      assert.equal(await isMember(ANOTHER_PRIVATE, user), false);
    });

    test("a banned user cannot redeem, even with a valid invitation", async () => {
      const id = await invite(PRIVATE, { maxUses: 5 });
      await assert.rejects(redeem(PRIVATE, id, BANNED), /banned/);
      assert.equal(await uses(id), 0);
    });

    test("redeeming also settles a pending join request so it doesn't linger in the admins' queue", async () => {
      const id = await invite(HIDDEN, { maxUses: 5 });
      const user = uid(68);
      await seedUser(t, user);
      await t.owner(`insert into group_join_requests (group_id, user_id, status) values ($1, $2, 'pending')`, [HIDDEN, user]);
      await redeem(HIDDEN, id, user);
      const [req] = await t.owner<{ status: string }>(`select status from group_join_requests where group_id = $1 and user_id = $2`, [HIDDEN, user]);
      assert.equal(req.status, "approved");
    });

    test("the use-count invariant holds at the database level", async () => {
      const id = await invite(PRIVATE, { maxUses: 1 });
      await assert.rejects(t.owner(`update group_invites set use_count = 2 where id = $1`, [id]), /check/);
    });
  });
});
