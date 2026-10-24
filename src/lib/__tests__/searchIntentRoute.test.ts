// POST /api/ai/search-intent: signed-in only, rate limited, behind the AI guard, cached, and only ever answering with
// races that exist. The session, limiter, guard, cache, archive and provider are stubbed: no real AI call is made.
//
// Run with --experimental-test-module-mocks (see the `test` script).

import { before, beforeEach, describe, test } from "node:test";
import assert from "node:assert/strict";
import { mockModule } from "./support/mockModule";

let session: { uid?: string } = {};
let limited: Response | null = null;
let guard: { allowed: boolean; reason?: string; retryAfterSeconds?: number } = { allowed: true };
let reply = "";
let calls = 0;
const cache = new Map<string, unknown>();

mockModule("@/lib/session/getSession", { getSession: async () => session });
mockModule("@/lib/rateLimit", { limitRequest: async () => limited });
mockModule("@/lib/ai/guardrails", { guardAIExecution: async () => guard, sanitizePromptInput: (s: string, n: number) => s.slice(0, n) });
mockModule("@/lib/ai/providerFallback", {
  chatWithProviderFallback: async () => {
    calls += 1;
    return { response: { content: reply, finishReason: "stop" }, providerName: "stub", model: "stub", fallbackUsed: false };
  },
});
mockModule("@/lib/ai/cache", {
  getCachedIntelligence: async (k: string) => cache.get(k) ?? null,
  setCachedIntelligence: async (k: string, v: unknown) => void cache.set(k, v),
  withSingleFlight: async (_k: string, f: () => Promise<unknown>) => f(),
});
mockModule("@/lib/supabase/archive", {
  getAllArchiveDrivers: async () => [{ driverId: "norris", name: "Lando Norris", code: "NOR", firstYear: 2019, lastYear: 2026 }],
  getAllArchiveTeams: async () => [],
  getAllArchiveCircuits: async () => [],
  getArchiveRacesByCircuitId: async () => [],
  getArchiveEntityRaces: async () => [
    { id: "a", year: 2024, round: 6, raceName: "Miami Grand Prix", circuitName: "Miami", results: [{ position: 1, positionText: "1", grid: 5, driverId: "norris", driverName: "Lando Norris", teamId: "mclaren" }] },
    { id: "b", year: 2024, round: 18, raceName: "Singapore Grand Prix", circuitName: "Marina Bay", results: [{ position: 1, positionText: "1", grid: 1, driverId: "norris", driverName: "Lando Norris", teamId: "mclaren" }] },
  ],
});

let route: typeof import("../../app/api/ai/search-intent/route");
before(async () => {
  route = await import("../../app/api/ai/search-intent/route");
});
beforeEach(() => {
  session = { uid: "u1" };
  limited = null;
  guard = { allowed: true };
  reply = '{"kind":"races","driver":"Norris","won":true,"minGrid":2}';
  calls = 0;
  cache.clear();
});

const post = (query: unknown) => route.POST(new Request("http://localhost/api/ai/search-intent", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ query }) }));

describe("POST /api/ai/search-intent", () => {
  test("refuses a signed-out caller", async () => {
    session = {};
    assert.equal((await post("races norris won")).status, 401);
    assert.equal(calls, 0);
  });

  test("answers the rate limiter's refusal", async () => {
    limited = new Response(null, { status: 429 });
    assert.equal((await post("races norris won")).status, 429);
    assert.equal(calls, 0);
  });

  test("falls back to no results when the guard says no", async () => {
    guard = { allowed: false, reason: "AI_DISABLED", retryAfterSeconds: 0 };
    const res = await post("races norris won");
    assert.deepEqual(await res.json(), { results: [], unavailable: "AI_DISABLED", retryAfterSeconds: 0 });
    assert.equal(calls, 0);
  });

  test("turns the reading into real races, and caches the reading", async () => {
    const body = (await (await post("races where Norris won from outside pole")).json()) as { results: { label: string }[] };
    assert.deepEqual(body.results.map((r) => r.label), ["2024 Miami Grand Prix"]);
    await post("Races where norris won from outside pole ");
    assert.equal(calls, 1);
  });

  test("an invalid model reply returns nothing, not a guess", async () => {
    reply = '{"kind":"races","driver":"Norris","minGrid":"lots"}';
    assert.deepEqual(await (await post("norris somehow")).json(), { results: [] });
  });

  test("rejects a query too short to read", async () => {
    assert.equal((await post("ab")).status, 400);
  });
});
