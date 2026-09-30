// Route-level cache isolation for POST /api/ai/race-intelligence (audit AI-02 / AI-03 / AI-08, M0
// Batch 3). The REAL route, REAL context builder (buildRaceIntelligenceContext) and REAL cache, with
// the data loaders stubbed and a deliberately leaky stub model that copies everything it was shown
// into its output. The shared analysis is cached under one key for every visitor, so anything
// personal that reaches its generation would appear verbatim for the next reader.
//
// Run with --experimental-test-module-mocks (see the `test` script).

import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { FakeSupabase } from "../../__tests__/support/fakeSupabase";
import { mockModule } from "../../__tests__/support/mockModule";
import type { RaceIntelligenceContext } from "../context/raceContext";

const RACE = "2026_r15_azerbaijan-grand-prix";
const ARCHIVE = "1998_r03_argentine-grand-prix";
const ALICE = "user-alice"; // favourite: Alonso (P7) / Aston Martin
const BOB = "user-bob"; // favourite: Norris (P8) / McLaren

let session: { uid: string } | null;
const profiles: Record<string, { favoriteDrivers: string[]; favoriteTeams: string[] }> = {
  [ALICE]: { favoriteDrivers: ["alonso"], favoriteTeams: ["aston_martin"] },
  [BOB]: { favoriteDrivers: ["norris"], favoriteTeams: ["mclaren"] },
};
const cards: Record<string, { driverId: string; name: string; code: string; team: string }> = {
  alonso: { driverId: "alonso", name: "Fernando Alonso", code: "ALO", team: "Aston Martin" },
  norris: { driverId: "norris", name: "Lando Norris", code: "NOR", team: "McLaren" },
};
const teams: Record<string, { teamId: string; name: string; currentName: string }> = {
  aston_martin: { teamId: "aston_martin", name: "Aston Martin", currentName: "Aston Martin" },
  mclaren: { teamId: "mclaren", name: "McLaren", currentName: "McLaren" },
};
const result = (driver: string, driverName: string, team: string, finishPosition: number) => ({ driver, driverName, team, finishPosition, finishGapSec: null, status: "finished", fastestLapSec: null, points: 0, grid: finishPosition });

let modelCalls: { context: RaceIntelligenceContext; needShared: boolean; needPersonal: boolean; userId: string | null }[];
async function leakyModel(context: RaceIntelligenceContext, agentContext: { userId: string | null }, options: { needShared: boolean; needPersonal: boolean }) {
  modelCalls.push({ context, ...options, userId: agentContext.userId });
  await new Promise((r) => setTimeout(r, 5));
  const everything = JSON.stringify(context);
  return {
    shared: options.needShared ? { data: { headline: "Shared", leak: everything }, generationMode: "ai" } : null,
    personal: options.needPersonal ? { data: { title: "Personal", leak: everything }, generationMode: "ai" } : null,
  };
}

mockModule("next/cache", { revalidateTag: () => {}, unstable_cache: (fn: unknown) => fn });
mockModule("@/lib/session/getSession", { getSession: async () => session });
mockModule("@/lib/supabase/races", {
  getRaceById: async (id: string) =>
    id === RACE
      ? {
          id: RACE, year: 2026, round: 15, name: "Azerbaijan Grand Prix", circuit: "Baku", status: "completed", updatedAt: "2026-09-28T00:00:00Z",
          results: [result("VER", "Max Verstappen", "Red Bull", 1), result("LEC", "Charles Leclerc", "Ferrari", 2), result("PIA", "Oscar Piastri", "McLaren", 3), result("ALO", "Fernando Alonso", "Aston Martin", 7), result("NOR", "Lando Norris", "McLaren", 8)],
          weather: null, tireStints: [], tireCompoundPace: null, safetyCarPeriods: 1, trafficStats: null,
        }
      : null,
  getRaceLaps: async () => {
    throw new Error("no laps in this test");
  },
});
mockModule("@/lib/supabase/archive", {
  getAllArchiveCircuits: async () => [],
  getArchiveRace: async (year: number, round: number) => (year === 1998 && round === 3 ? { id: ARCHIVE, year, round, raceName: "Argentine Grand Prix", circuitName: "Autodromo", circuitId: null, raceDate: "1998-04-12", results: [] } : null),
  getArchiveRaceLaps: async () => [],
  getArchiveSeason: async () => [],
});
mockModule("@/lib/personalization", {
  computeSeasonStandings: async () => ({ drivers: [{ driver: "VER" }], teams: [{ team: "Red Bull" }], poleCounts: {} }),
  getTrackHistory: async () => null,
  getFavoriteDriverCard: async (id: string) => (cards[id] ? { ...cards[id], headshotUrl: null, isActiveThisSeason: true, raceCount: 1, firstYear: 2020, lastYear: 2026, href: "" } : null),
  getFavoriteTeamCard: async (id: string) => (teams[id] ? { ...teams[id], color: null, logoUrl: null, isActiveThisSeason: true, raceCount: 1, firstYear: 2020, lastYear: 2026, href: "" } : null),
});
mockModule("@/lib/supabase/users", { getUserProfile: async (uid: string) => profiles[uid] ?? null });
mockModule("@/lib/ai/orchestrator", { generateRaceIntelligence: leakyModel });
mockModule("@/lib/ai/providerRateLimiter", { checkProviderCapacity: () => ({ allowed: true, currentRPM: 0, limit: 40, retryAfterSeconds: 0 }) });
mockModule("@/lib/ai/guardrails", { checkUserRateLimit: () => ({ allowed: true, retryAfterSeconds: 0 }) });

let POST: (req: Request) => Promise<Response>;
let resetMemoryCache: () => void;
let fake: FakeSupabase;

before(async () => {
  const { supabaseAdmin } = await import("../../supabase/admin");
  Object.assign(supabaseAdmin as unknown as Record<string, unknown>, { from: (t: string) => fake.from(t) });
  ({ POST } = await import("../../../app/api/ai/race-intelligence/route"));
  ({ resetMemoryCache } = await import("../cache"));
});

beforeEach(() => {
  fake = new FakeSupabase();
  resetMemoryCache();
  modelCalls = [];
});

type Body = { shared: { content: unknown } | null; personal: { content: unknown } | null; dataCoverage: Record<string, boolean>; error?: string };
async function visit(uid: string | null, query = `raceId=${RACE}`): Promise<{ status: number; body: Body }> {
  session = uid ? { uid } : null;
  const res = await POST(new Request(`http://test.local/api/ai/race-intelligence?${query}`, { method: "POST" }));
  return { status: res.status, body: (await res.json()) as Body };
}
const s = (v: unknown) => JSON.stringify(v ?? null);
const keys = () => fake.rows("ai_cache").map((r) => String(r.key));

describe("race AI cache isolation", () => {
  test("the shared analysis generated on a signed-in user's cold visit contains nothing about that user", async () => {
    const alice = await visit(ALICE);
    assert.ok(s(alice.body.personal).includes("Fernando Alonso finished P7"), "fixture sanity: Alice's personal insight used her favourite");
    for (const personal of ["favorite-driver-result", "favorite-team-result", "Fernando Alonso finished"]) {
      assert.ok(!s(alice.body.shared).includes(personal), `shared content was generated without "${personal}"`);
    }
    const sharedCall = modelCalls.find((c) => c.needShared)!;
    assert.equal(sharedCall.needPersonal, false);
    assert.deepEqual(sharedCall.context.favoriteDrivers, []);
    assert.ok(sharedCall.context.evidenceFacts.every((f) => f.source !== "favoriteDriver" && f.source !== "favoriteTeam"));

    const anon = await visit(null);
    assert.ok(!s(anon.body).includes("favorite-driver-result"), "the anonymous reader never sees Alice's favourite facts");
    assert.equal(anon.body.personal, null);
  });

  test("one shared entry for everybody: users with and without favourites read the same key (AI-08)", async () => {
    await visit(ALICE);
    const callsAfterAlice = modelCalls.length;
    await visit(null);
    await visit(BOB);
    assert.equal(modelCalls.filter((c) => c.needShared).length, 1, "the shared analysis was generated once, then served from cache");
    assert.equal(modelCalls.length, callsAfterAlice + 1, "Bob only needed his own personal generation");
    assert.equal(keys().filter((k) => k.startsWith("ai:race:shared:")).length, 1);
  });

  test("another user's personal insight is their own", async () => {
    await visit(ALICE);
    const bob = await visit(BOB);
    assert.ok(s(bob.body.personal).includes("Lando Norris finished P8"));
    assert.ok(!s(bob.body.personal).includes("Fernando Alonso finished"));
  });

  test("concurrent cold visits: one shared generation, one personal generation per user", async () => {
    const [alice, bob, anon] = await Promise.all([visit(ALICE), visit(BOB), visit(null)]);
    assert.equal(modelCalls.filter((c) => c.needShared).length, 1);
    assert.deepEqual(modelCalls.filter((c) => c.needPersonal).map((c) => c.userId).sort(), [ALICE, BOB]);
    assert.ok(s(alice.body.personal).includes("Alonso") && !s(alice.body.personal).includes("Lando Norris finished"));
    assert.ok(s(bob.body.personal).includes("Norris") && !s(bob.body.personal).includes("Fernando Alonso finished"));
    assert.ok(!s(anon.body).includes("favorite-driver-result"));
  });

  test("changing favourites gives a new personal entry and leaves the shared entry alone", async () => {
    await visit(ALICE);
    profiles[ALICE].favoriteDrivers = ["norris"];
    try {
      const after = await visit(ALICE);
      assert.ok(s(after.body.personal).includes("Lando Norris finished P8"));
      assert.equal(modelCalls.filter((c) => c.needShared).length, 1);
    } finally {
      profiles[ALICE].favoriteDrivers = ["alonso"];
    }
  });

  test("AI-03: an archive request whose raceId does not match its year/round is refused and caches nothing", async () => {
    const res = await visit(null, `raceId=${RACE}&source=archive&year=1998&round=3`);
    assert.equal(res.status, 400);
    assert.equal(modelCalls.length, 0);
    assert.deepEqual(keys(), []);
  });

  test("a genuine archive request is cached in its own namespace, never under a live race's key", async () => {
    const res = await visit(null, `raceId=${ARCHIVE}&source=archive&year=1998&round=3`);
    assert.equal(res.status, 200);
    assert.ok(keys().length === 1 && keys()[0].startsWith(`ai:race:shared:archive_${ARCHIVE}:`), keys().join(","));
  });
});
