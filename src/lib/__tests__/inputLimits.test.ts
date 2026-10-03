// Size caps and error handling on the profile, sign-up, pick and favorites endpoints, and the
// last-admin guard (audit SEC-25). Drives the real route handlers; users.ts runs against the
// in-memory Supabase fake, while sign-up and picks are stubbed at their service boundary.
//
// Run with --experimental-test-module-mocks (see the `test` script).

import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase, type Row } from "./support/fakeSupabase";
import { mockModule } from "./support/mockModule";

let session: { uid?: string } = {};
const signups: unknown[] = [];
const savedPicks: unknown[] = [];

mockModule("next/cache", { revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn });
mockModule("@/lib/session/getSession", { getSession: async () => session });
mockModule("@/services/auth.service", {
  completeSignup: async (input: unknown) => {
    signups.push(input);
    return { ok: true };
  },
});
mockModule("@/lib/supabase/picks", {
  getUserPick: async () => null,
  saveUserPick: async (_uid: string, pick: unknown) => {
    savedPicks.push(pick);
  },
});

let supabaseAdmin: Record<string, unknown>;
let users: typeof import("../supabase/users");
let me: typeof import("../../app/api/users/me/route");
let signup: typeof import("../../app/api/auth/complete-signup/route");
let picks: typeof import("../../app/api/picks/route");
let favorites: typeof import("../../app/api/archive/favorites/route");
let fake: FakeSupabase;
const useFake = () => Object.assign(supabaseAdmin, { from: (t: string) => fake.from(t) });

before(async () => {
  supabaseAdmin = (await import("../supabase/admin")).supabaseAdmin as unknown as Record<string, unknown>;
  useFake();
  users = await import("../supabase/users");
  me = await import("../../app/api/users/me/route");
  signup = await import("../../app/api/auth/complete-signup/route");
  picks = await import("../../app/api/picks/route");
  favorites = await import("../../app/api/archive/favorites/route");
});

const profile = (id: string, over: Row = {}): Row => ({
  id, email: `${id}@example.test`, role: null, first_name: "Ann", last_name: "Lee", username: id,
  favorite_drivers: [], favorite_teams: [], favorite_tracks: [], notify_before_qualifying: false, notify_on_results: false, ...over,
});

beforeEach(() => {
  fake = new FakeSupabase();
  fake.seed("profiles", profile("user-1"), profile("admin-1", { role: "admin" }));
  useFake();
  session = { uid: "user-1" };
  signups.length = 0;
  savedPicks.length = 0;
});

const request = (body: unknown, method = "POST") =>
  new Request("http://test.local/api", { method, headers: { "content-type": "application/json" }, body: typeof body === "string" ? body : JSON.stringify(body) });
const long = (n: number) => "x".repeat(n);
const row = (id: string) => fake.rows("profiles").find((r) => r.id === id)!;
const hasStatus = (status: number) => (err: unknown) => (err as { httpStatus?: number }).httpStatus === status;

describe("PATCH /api/users/me", () => {
  test("stores valid preferences, and never an unknown key", async () => {
    const res = await me.PATCH(request({ firstName: "Ann-Marie", favoriteDrivers: ["leclerc"], notifyOnResults: true, role: "admin" }, "PATCH"));
    assert.equal(res.status, 200);
    assert.equal(row("user-1").first_name, "Ann-Marie");
    assert.deepEqual(row("user-1").favorite_drivers, ["leclerc"]);
    assert.equal(row("user-1").notify_on_results, true);
    assert.equal(row("user-1").role, null);
  });

  test("refuses an over-long name, oversized lists, a wrong type and bad JSON, writing nothing", async () => {
    const bodies: unknown[] = [
      { firstName: long(51) },
      { favoriteDrivers: Array.from({ length: 201 }, (_, i) => `d${i}`) },
      { favoriteTeams: [long(65)] },
      { notifyOnResults: "yes" },
      "not json",
    ];
    for (const body of bodies) assert.equal((await me.PATCH(request(body, "PATCH"))).status, 400, JSON.stringify(body).slice(0, 60));
    assert.equal(row("user-1").first_name, "Ann");
    assert.deepEqual(row("user-1").favorite_drivers, []);
  });
});

describe("POST /api/auth/complete-signup", () => {
  test("passes a valid sign-up through, trimmed", async () => {
    const res = await signup.POST(request({ firstName: " Ann ", lastName: "Lee", username: "ann_lee", favoriteDrivers: ["leclerc"] }));
    assert.equal(res.status, 200);
    assert.deepEqual(signups, [{ firstName: "Ann", lastName: "Lee", username: "ann_lee", favoriteDrivers: ["leclerc"] }]);
  });

  test("refuses over-long values with a clear message", async () => {
    for (const body of [{ firstName: long(51), lastName: "Lee", username: "ann" }, { firstName: "Ann", lastName: "Lee", username: long(51) }]) {
      const res = await signup.POST(request(body));
      assert.equal(res.status, 400);
      assert.equal(((await res.json()) as { error: string }).error, "A name or username is too long.");
    }
    assert.equal(signups.length, 0);
  });

  test("missing fields keep their old message", async () => {
    const res = await signup.POST(request({ firstName: "Ann" }));
    assert.equal(res.status, 400);
    assert.equal(((await res.json()) as { error: string }).error, "Missing required fields.");
  });
});

describe("POST /api/picks", () => {
  const pick = { raceId: "2026_r16_bahrain-grand-prix", predictedWinner: "VER", predictedPodium: ["VER", "NOR", "LEC"] };

  test("a normal pick is saved", async () => {
    assert.equal((await picks.POST(request(pick))).status, 200);
    assert.deepEqual(savedPicks, [pick]);
  });

  test("oversized or malformed picks are refused", async () => {
    const bodies = [
      { ...pick, raceId: long(65) },
      { ...pick, predictedWinner: long(17) },
      { ...pick, predictedPodium: ["VER", "NOR"] },
      { ...pick, predictedPodium: ["VER", "NOR", long(17)] },
    ];
    for (const body of bodies) assert.equal((await picks.POST(request(body))).status, 400);
    assert.equal(savedPicks.length, 0);
  });

  test("signed out is still 401", async () => {
    session = {};
    assert.equal((await picks.POST(request(pick))).status, 401);
  });
});

describe("POST /api/archive/favorites", () => {
  test("adds and removes one favorite", async () => {
    assert.equal((await favorites.POST(request({ type: "driver", id: "leclerc", favorited: true }))).status, 200);
    assert.deepEqual(row("user-1").favorite_drivers, ["leclerc"]);
    assert.equal((await favorites.POST(request({ type: "driver", id: "leclerc", favorited: false }))).status, 200);
    assert.deepEqual(row("user-1").favorite_drivers, []);
  });

  test("an over-long id is refused, and a full list can't grow (but can shrink)", async () => {
    assert.equal((await favorites.POST(request({ type: "driver", id: long(65), favorited: true }))).status, 400);
    row("user-1").favorite_drivers = Array.from({ length: 200 }, (_, i) => `d${i}`);
    assert.equal((await favorites.POST(request({ type: "driver", id: "one-more", favorited: true }))).status, 400);
    assert.equal((row("user-1").favorite_drivers as string[]).length, 200);
    assert.equal((await favorites.POST(request({ type: "driver", id: "d0", favorited: false }))).status, 200);
    assert.equal((row("user-1").favorite_drivers as string[]).length, 199);
  });
});

describe("setUserRole: the platform keeps at least one admin", () => {
  test("the only admin can't be demoted", async () => {
    await assert.rejects(users.setUserRole("admin-1", null), hasStatus(409));
    await assert.rejects(users.setUserRole("admin-1", "moderator"), hasStatus(409));
    assert.equal(row("admin-1").role, "admin");
  });

  test("an admin can be demoted once there is another one", async () => {
    await users.setUserRole("user-1", "admin");
    await users.setUserRole("admin-1", "moderator");
    assert.equal(row("admin-1").role, "moderator");
    await assert.rejects(users.setUserRole("user-1", null), hasStatus(409), "user-1 is now the last admin");
  });
});

describe("database errors are no longer ignored", () => {
  test("updateUserPreferences and setUserRole throw when the update fails", async () => {
    const failed = Promise.resolve({ data: null, error: { message: "boom" } });
    Object.assign(supabaseAdmin, { from: () => ({ update: () => ({ eq: () => failed }) }) });
    await assert.rejects(users.updateUserPreferences("user-1", { firstName: "Ann" }), /boom/);
    await assert.rejects(users.setUserRole("user-1", "admin"), /boom/);
  });
});
