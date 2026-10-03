// Route-level cache isolation for POST /api/ai/homepage-intelligence (audit AI-02, M0 Batch 3).
//
// Drives the REAL route handler, the REAL cache (L1 map + ai_cache through an in-memory Supabase
// fake) and the real tier plan, with the data loaders and the model stubbed. The stub model is
// deliberately leaky: it copies EVERYTHING it was shown into a shared output field, which is the
// worst case the old "strip the personal fields afterwards" approach could not defend against. If
// any user's private data reached a generation that is stored where someone else can read it, it
// shows up verbatim in what the other reader receives.
//
// Run with --experimental-test-module-mocks (see the `test` script).

import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase, type Row } from "../../__tests__/support/fakeSupabase";
import { mockModule } from "../../__tests__/support/mockModule";
import { generateDeterministicFallback } from "../fallback";
import type { HomepageContextData } from "../context";

// ── the world ──────────────────────────────────────────────────────────────────────────────────
const ALICE = "user-alice";
const BOB = "user-bob";
const CAROL = "user-carol"; // signed in, no favourites/pick/predictions, member of a private community
const SECRET_GROUP = "group-secret";
const SECRET_POST = "SECRET-PLAN-leclerc-undercut";

type Profile = { favoriteDrivers: string[]; favoriteTeams: string[]; favoriteTracks: string[]; lastHomepageVisitAt: string | null };
let session: { uid: string } | null;
let profiles: Record<string, Profile>;
let memberships: Record<string, string[] | "fail">;
let picks: Record<string, Row[]>;

const drivers: Record<string, { driverId: string; name: string; code: string; team: string }> = {
  leclerc: { driverId: "leclerc", name: "Charles Leclerc", code: "LEC", team: "Ferrari" },
  norris: { driverId: "norris", name: "Lando Norris", code: "NOR", team: "McLaren" },
  alonso: { driverId: "alonso", name: "Fernando Alonso", code: "ALO", team: "Aston Martin" },
};

// ── the leaky model ────────────────────────────────────────────────────────────────────────────
let modelCalls: { context: HomepageContextData; version: string; userId: string | null }[];
async function leakyModel(context: HomepageContextData, agentContext: { userId: string | null }, version: string) {
  modelCalls.push({ context, version, userId: agentContext.userId });
  await new Promise((r) => setTimeout(r, 5));
  const base = generateDeterministicFallback({}, "TEST").data;
  return {
    data: { ...base, raceBrief: { headline: "Race brief", whyItMatters: JSON.stringify(context), keyFactor: "k" } },
    isFallback: false,
    modelIdentifier: "stub",
    promptVersion: "test",
  };
}

mockModule("next/cache", { revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn });
mockModule("@/lib/session/getSession", { getSession: async () => session });
mockModule("@/lib/supabase/races", {
  getNextUpcomingRace: async () => ({ id: "2026_r16_bahrain-grand-prix", name: "Bahrain Grand Prix", round: 16, year: 2026, circuit: "Sakhir", status: "upcoming", simulation: null, prediction: null, inputs: [] }),
  getRacesByYear: async () => [],
});
mockModule("@/lib/supabase/archive", { getAllArchiveCircuits: async () => [] });
mockModule("@/lib/personalization", {
  computeSeasonStandings: async () => ({ drivers: [{ driver: "VER", driverName: "Max Verstappen", team: "Red Bull", points: 300 }], teams: [{ team: "Red Bull", points: 500 }], poleCounts: {} }),
  getTrackHistory: async () => null,
  getFavoriteDriverCard: async (id: string) => (drivers[id] ? { ...drivers[id], headshotUrl: null, isActiveThisSeason: true, raceCount: 1, firstYear: 2020, lastYear: 2026, href: "" } : null),
  getFavoriteTeamCard: async (id: string) => ({ teamId: id, name: id, currentName: id, color: null, logoUrl: null, isActiveThisSeason: true, raceCount: 1, firstYear: 2020, lastYear: 2026, href: "" }),
});
mockModule("@/lib/supabase/users", {
  getUserProfile: async (uid: string) => profiles[uid] ?? null,
  touchHomepageVisit: async () => {},
});
mockModule("@/lib/supabase/picks", { getUserPicksForYear: async (uid: string) => picks[uid] ?? [] });
mockModule("@/lib/supabase/groupPosts", {
  getJoinedGroupIds: async (uid: string) => {
    const m = memberships[uid] ?? [];
    if (m === "fail") throw new Error("database unavailable");
    return m;
  },
  listFeedPosts: async (uid: string) => {
    const m = memberships[uid];
    const joined = m === "fail" || !m ? [] : m;
    return { posts: joined.includes(SECRET_GROUP) ? [{ title: SECRET_POST, groupName: "Secret Club", createdAt: "2026-09-28T10:00:00Z" }] : [], nextCursor: null };
  },
});
mockModule("@/lib/ai/orchestrator", { generateHomepageIntelligence: leakyModel });
mockModule("@/lib/ai/providerRateLimiter", { checkProviderCapacity: () => ({ allowed: true, currentRPM: 0, limit: 40, retryAfterSeconds: 0 }) });
mockModule("@/lib/ai/guardrails", { checkUserRateLimit: () => ({ allowed: true, retryAfterSeconds: 0 }) });

let POST: (request: Request) => Promise<Response>;
let resetMemoryCache: () => void;
let fake: FakeSupabase;

before(async () => {
  const { supabaseAdmin } = await import("../../supabase/admin");
  Object.assign(supabaseAdmin as unknown as Record<string, unknown>, { from: (t: string) => fake.from(t) });
  ({ POST } = await import("../../../app/api/ai/homepage-intelligence/route"));
  ({ resetMemoryCache } = await import("../cache"));
});

beforeEach(() => {
  fake = new FakeSupabase();
  resetMemoryCache();
  modelCalls = [];
  session = null;
  profiles = {
    [ALICE]: { favoriteDrivers: ["leclerc"], favoriteTeams: ["ferrari"], favoriteTracks: [], lastHomepageVisitAt: null },
    [BOB]: { favoriteDrivers: ["norris"], favoriteTeams: ["mclaren"], favoriteTracks: [], lastHomepageVisitAt: null },
    [CAROL]: { favoriteDrivers: [], favoriteTeams: [], favoriteTracks: [], lastHomepageVisitAt: null },
  };
  memberships = { [ALICE]: [SECRET_GROUP], [BOB]: [], [CAROL]: [SECRET_GROUP] };
  picks = { [ALICE]: [{ raceId: "2026_r16_bahrain-grand-prix", predictedWinner: "ALICE-PICK-LEC", submittedAt: "2026-09-28T09:00:00Z" }] };
});

type Body = { data: { raceBrief: { whyItMatters: string } }; cached: boolean; cacheTier?: string };
async function visit(uid: string | null): Promise<Body> {
  session = uid ? { uid } : null;
  const res = await POST(new Request("http://localhost/api/ai/homepage-intelligence", { method: "POST" }));
  return (await res.json()) as Body;
}
const text = (b: Body) => JSON.stringify(b.data);
const aliceSecrets = [SECRET_POST, "Secret Club", "Charles Leclerc", "ALICE-PICK-LEC"];
const cacheKeys = () => fake.rows("ai_cache").map((r) => String(r.key));

describe("homepage AI cache isolation", () => {
  test("a personalised generation is never written to the global tier, and an anonymous visitor never sees it", async () => {
    const alice = await visit(ALICE);
    for (const s of aliceSecrets) assert.ok(text(alice).includes(s), `fixture sanity: Alice's own response carries ${s}`);
    assert.deepEqual(cacheKeys().map((k) => k.split(":")[1]), ["personal"], "only Alice's own personal entry was written");
    assert.ok(cacheKeys()[0].includes(ALICE));

    const anon = await visit(null);
    assert.equal(anon.cached, false, "the anonymous visitor could not be served Alice's generation from cache");
    for (const s of aliceSecrets) assert.ok(!text(anon).includes(s), `anonymous response must not contain ${s}`);

    // The anonymous generation itself was shown nothing personal.
    const anonCall = modelCalls.at(-1)!;
    assert.deepEqual(Object.keys(anonCall.context).sort(), ["model", "race", "simulation", "standings", "trackHistory"]);
  });

  test("a later anonymous visitor is served the clean global entry from cache", async () => {
    await visit(null);
    await visit(ALICE);
    const again = await visit(null);
    assert.equal(again.cached, true);
    assert.equal(again.cacheTier, "global");
    for (const s of aliceSecrets) assert.ok(!text(again).includes(s));
  });

  test("another signed-in user gets their own generation, never Alice's", async () => {
    await visit(ALICE);
    const bob = await visit(BOB);
    assert.equal(bob.cached, false);
    for (const s of aliceSecrets) assert.ok(!text(bob).includes(s), `Bob must not see ${s}`);
    assert.ok(text(bob).includes("Lando Norris"));
    assert.equal(new Set(cacheKeys()).size, 2);
  });

  test("a default-state member of a private community gets the shared tier, generated without their feed", async () => {
    const carol = await visit(CAROL);
    assert.ok(!text(carol).includes(SECRET_POST), "Carol's own private feed is not put into a shareable generation");
    assert.deepEqual(cacheKeys().map((k) => k.split(":")[1]), ["global"]);
    const anon = await visit(null);
    assert.equal(anon.cacheTier, "global", "and that entry is safely reusable by anyone");
    assert.ok(!text(anon).includes(SECRET_POST));
    assert.equal(modelCalls.length, 1);
  });

  test("concurrent cold visits by Alice and a guest never share a generation", async () => {
    const [alice, anon] = await Promise.all([visit(ALICE), visit(null)]);
    assert.equal(modelCalls.length, 2, "two tiers, two single-flights");
    assert.ok(text(alice).includes(SECRET_POST));
    for (const s of aliceSecrets) assert.ok(!text(anon).includes(s));
  });

  test("changing favourites invalidates the personal entry", async () => {
    await visit(ALICE);
    const cachedBefore = await visit(ALICE);
    assert.equal(cachedBefore.cached, true);
    profiles[ALICE].favoriteDrivers = ["alonso"];
    const after = await visit(ALICE);
    assert.equal(after.cached, false);
    assert.ok(text(after).includes("Fernando Alonso") && !text(after).includes("Charles Leclerc"));
  });

  test("leaving a private community invalidates the personal entry that quoted its posts", async () => {
    const before = await visit(ALICE);
    assert.ok(text(before).includes(SECRET_POST));
    memberships[ALICE] = [];
    const after = await visit(ALICE);
    assert.equal(after.cached, false, "the old entry is not served after the membership change");
    assert.ok(!text(after).includes(SECRET_POST));
  });

  test("joining a community also produces a fresh entry (the key follows membership both ways)", async () => {
    await visit(BOB);
    memberships[BOB] = [SECRET_GROUP];
    const after = await visit(BOB);
    assert.equal(after.cached, false);
  });

  test("a global entry the OLD code wrote (possibly carrying someone's personal text) is never served after deploy", async () => {
    const { buildGlobalCacheKey, computeDataVersion, setCachedIntelligence } = await import("../cache");
    // Exactly the old globalDataVersion for this fixture: [raceId, simTop, rfTop] with no tier version.
    const oldKey = buildGlobalCacheKey("2026_r16_bahrain-grand-prix", computeDataVersion(["2026_r16_bahrain-grand-prix", "", ""]));
    const leaky = generateDeterministicFallback({}, "TEST").data;
    await setCachedIntelligence(oldKey, { ...leaky, raceBrief: { headline: "x", whyItMatters: SECRET_POST, keyFactor: "x" } }, "old", 3600);
    const anon = await visit(null);
    assert.equal(anon.cached, false);
    assert.ok(!text(anon).includes(SECRET_POST));
  });

  test("if memberships cannot be read, the request is served as the shared tier - nothing personal is generated or cached", async () => {
    memberships[ALICE] = "fail";
    const alice = await visit(ALICE);
    for (const s of aliceSecrets) assert.ok(!text(alice).includes(s));
    assert.deepEqual(cacheKeys().map((k) => k.split(":")[1]), ["global"]);
  });
});
