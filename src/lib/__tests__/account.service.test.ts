// Account export and deletion (audit R-53), service layer: the export holds everything the person owns and nobody
// else's rows (paging past PostgREST's row cap), and deletion runs the database function, removes their uploads and
// sign-in codes, then the auth user - in that order, and safely again after a partial failure. What delete_account
// does inside the database is tested against the real schema in db/accountDeletion.test.ts.

import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase, newId } from "./support/fakeSupabase";
import { OWNED_TABLES } from "../supabase/account";

const ME = newId();
const OTHER = newId();

let account: typeof import("../supabase/account");
let fake: FakeSupabase;
let files: Record<string, { name: string; metadata: { size: number } }[]>;
let removed: string[];
let authDeleted: string[];
let authError: { message: string } | null;
const steps: string[] = [];

before(async () => {
  const { supabaseAdmin } = await import("../supabase/admin");
  account = await import("../supabase/account");
  Object.assign(supabaseAdmin as unknown as Record<string, unknown>, {
    from: (t: string) => fake.from(t),
    rpc: (fn: string, a?: Record<string, unknown>) => {
      steps.push(`rpc:${fn}`);
      return fake.rpc(fn, a);
    },
    storage: {
      from: () => ({
        list: async (folder: string, opts: { limit: number; offset: number }) => ({ data: (files[folder] ?? []).slice(opts.offset, opts.offset + opts.limit), error: null }),
        remove: async (paths: string[]) => {
          steps.push("storage:remove");
          removed.push(...paths);
          return { data: null, error: null };
        },
      }),
    },
    auth: {
      admin: {
        deleteUser: async (id: string) => {
          steps.push("auth:deleteUser");
          if (authError) return { data: null, error: authError };
          authDeleted.push(id);
          return { data: null, error: null };
        },
      },
    },
  });
});

beforeEach(() => {
  fake = new FakeSupabase();
  fake.maxRows = 1000;
  files = { [ME]: [{ name: "a.png", metadata: { size: 1200 } }, { name: "b.pdf", metadata: { size: 3400 } }], [OTHER]: [{ name: "x.png", metadata: { size: 1 } }] };
  removed = [];
  authDeleted = [];
  authError = null;
  steps.length = 0;
  fake.seed("profiles", { id: ME, email: "me@test.local", username: "me" }, { id: OTHER, email: "other@test.local" });
  fake.seed("otp_codes", { email: "me@test.local", code: "hash" }, { email: "other@test.local", code: "hash" });
});

describe("exportAccountData", () => {
  test("includes every owned table, only this person's rows, and their uploads", async () => {
    fake.seed("picks", { user_id: ME, race_id: "r1" }, { user_id: OTHER, race_id: "r1" });
    fake.seed("group_posts", { id: "p1", user_id: ME, content: "mine" }, { id: "p2", user_id: OTHER, content: "theirs" });
    fake.seed("groups", { id: "g1", created_by: ME }, { id: "g2", created_by: OTHER });
    // More notifications than one page holds: all of them come back.
    for (let i = 0; i < 1500; i++) fake.seed("notifications", { id: `n${i}`, user_id: ME });

    const data = await account.exportAccountData(ME, new Date("2026-10-23T10:00:00Z"));
    assert.equal(data.exportedAt, "2026-10-23T10:00:00.000Z");
    assert.equal(data.profile?.username, "me");
    assert.deepEqual(Object.keys(data.tables).sort(), OWNED_TABLES.map((t) => t.table).sort());
    assert.deepEqual(data.tables.picks, [{ user_id: ME, race_id: "r1" }]);
    assert.deepEqual(data.tables.group_posts.map((p) => p.id), ["p1"]);
    assert.deepEqual(data.tables.groups.map((g) => g.id), ["g1"]);
    assert.equal(data.tables.notifications.length, 1500);
    assert.deepEqual(data.uploads, [
      { path: `${ME}/a.png`, bytes: 1200 },
      { path: `${ME}/b.pdf`, bytes: 3400 },
    ]);
  });
});

describe("deleteAccount", () => {
  test("database first, then files and sign-in codes, then the auth user", async () => {
    fake.rpcs.delete_account = () => ({ data: { alreadyDeleted: false, deletedCommunities: 1, transferredCommunities: 2 }, error: null });
    const result = await account.deleteAccount(ME);
    assert.deepEqual(result, { deletedCommunities: 1, transferredCommunities: 2 });
    assert.deepEqual(fake.rpcCalls, [{ fn: "delete_account", args: { p_user_id: ME } }]);
    assert.deepEqual(steps, ["rpc:delete_account", "storage:remove", "auth:deleteUser"]);
    assert.deepEqual(removed, [`${ME}/a.png`, `${ME}/b.pdf`]);
    assert.deepEqual(authDeleted, [ME]);
    assert.deepEqual(fake.rows("otp_codes").map((r) => r.email), ["other@test.local"]);
  });

  test("a failed database step stops before anything else is removed", async () => {
    fake.rpcs.delete_account = () => ({ data: null, error: { message: "boom" } });
    await assert.rejects(account.deleteAccount(ME), /boom/);
    assert.deepEqual(removed, []);
    assert.deepEqual(authDeleted, []);
  });

  test("an auth user that's already gone is not an error (a retry after a partial failure)", async () => {
    fake.rpcs.delete_account = () => ({ data: { alreadyDeleted: true, deletedCommunities: 0, transferredCommunities: 0 }, error: null });
    authError = { message: "User not found" };
    assert.deepEqual(await account.deleteAccount(ME), { deletedCommunities: 0, transferredCommunities: 0 });
    authError = { message: "service unavailable" };
    await assert.rejects(account.deleteAccount(ME), /service unavailable/);
  });
});
