import { test, describe, beforeEach } from "node:test";
import assert from "node:assert/strict";
import {
  acquireProviderCapacity,
  checkProviderCapacity,
  getProviderRPM,
  resetProviderRateLimiter,
} from "../providerRateLimiter";
import { generateDeterministicFallback } from "../fallback";
import {
  validateHomepageIntelligence,
  ALLOWED_ACTION_TYPES,
} from "../schemas/homepageIntelligence";
import {
  buildGlobalCacheKey,
  buildPersonalCacheKey,
  computeDataVersion,
  getCachedIntelligence,
  setCachedIntelligence,
  resetMemoryCache,
} from "../cache";
import { buildHomepageContext } from "../context";
import { generateHomepageIntelligence } from "../orchestrator";
import { sanitizeActionType } from "../guardrails";
import type { AgentContext } from "../types";

describe("Provider-Aware Rate Limiting (40 RPM Ceiling)", () => {
  beforeEach(() => {
    resetProviderRateLimiter("nvidia");
  });

  test("allows requests up to the 40 RPM ceiling", () => {
    for (let i = 1; i <= 40; i++) {
      const cap = acquireProviderCapacity("nvidia");
      assert.equal(cap.allowed, true, `Request #${i} should be allowed`);
      assert.equal(cap.currentRPM, i);
      assert.equal(cap.limit, 40);
    }
    assert.equal(getProviderRPM("nvidia"), 40);
  });

  test("blocks the 41st request and returns retryAfterSeconds", () => {
    for (let i = 0; i < 40; i++) {
      acquireProviderCapacity("nvidia");
    }

    const blocked = acquireProviderCapacity("nvidia");
    assert.equal(blocked.allowed, false, "41st request must be throttled");
    assert.equal(blocked.currentRPM, 40);
    assert.ok(blocked.retryAfterSeconds > 0, "retryAfterSeconds must be positive");
    assert.ok(blocked.retryAfterSeconds <= 60, "retryAfterSeconds must be <= 60");
  });

  test("checkProviderCapacity inspects capacity without consuming tokens", () => {
    const initial = checkProviderCapacity("nvidia");
    assert.equal(initial.allowed, true);
    assert.equal(initial.currentRPM, 0);

    // Consume 1
    acquireProviderCapacity("nvidia");
    const afterOne = checkProviderCapacity("nvidia");
    assert.equal(afterOne.currentRPM, 1);
  });
});

describe("Deterministic Fallback Engine", () => {
  test("generates valid HomepageIntelligence adhering strictly to the schema", () => {
    const fallback = generateDeterministicFallback({
      race: {
        name: "Australian Grand Prix",
        round: 1,
        season: 2026,
        circuitName: "Albert Park Circuit",
      },
      standings: {
        driverLeader: { name: "Max Verstappen", points: 25 },
        driverSecond: { name: "Lando Norris", points: 18 },
        constructorLeader: { name: "Red Bull Racing", points: 37 },
      },
      trackHistory: {
        defendingWinner: "Carlos Sainz",
        topPerformer: "Lewis Hamilton",
        totalRaces: 27,
      },
      favoriteDriver: {
        name: "Lando Norris",
        rank: 2,
        points: 18,
      },
      favoriteTeam: {
        name: "McLaren",
        rank: 2,
        points: 30,
      },
      model: {
        topPredictedDriver: "Max Verstappen",
        winProbability: 0.44,
      },
      predictionPerformance: {
        winnerAccuracy: 60,
        totalPredictions: 10,
        avgPositionError: 1.2,
      },
    }, "TEST_REASON");

    assert.equal(fallback.isFallback, true);
    assert.equal(fallback.fallbackReason, "TEST_REASON");

    // Validate using runtime schema validator
    const validation = validateHomepageIntelligence(fallback.data);
    assert.equal(validation.valid, true, `Validation failed: ${validation.errors?.join(", ")}`);
    assert.ok(fallback.data.raceBrief.headline.length > 0);
    assert.ok(fallback.data.raceBrief.whyItMatters.length > 0);
    assert.ok(fallback.data.oneThingToWatch.topic.length > 0);
    assert.ok(fallback.data.biggestUncertainty.title.length > 0);
    assert.ok(fallback.data.favoriteDriverInsight !== null);
    assert.ok(fallback.data.favoriteTeamInsight !== null);
    assert.ok(fallback.data.predictionCoach !== null);
    assert.ok(ALLOWED_ACTION_TYPES.includes(fallback.data.nextAction.actionType));
  });

  test("handles completely empty data context gracefully", () => {
    const fallback = generateDeterministicFallback({}, "EMPTY_DATA");
    assert.equal(fallback.isFallback, true);
    const validation = validateHomepageIntelligence(fallback.data);
    assert.equal(validation.valid, true);
    assert.equal(fallback.data.favoriteDriverInsight, null);
    assert.equal(fallback.data.favoriteTeamInsight, null);
    assert.equal(fallback.data.predictionCoach, null);
  });
});

describe("Orchestrator Capacity Guarding & Direct Mode", () => {
  beforeEach(() => {
    resetProviderRateLimiter("nvidia");
  });

  test("returns deterministic fallback immediately when 40 RPM is reached", async () => {
    // Fill up quota
    for (let i = 0; i < 40; i++) {
      acquireProviderCapacity("nvidia");
    }

    const agentContext: AgentContext = {
      userId: "test_user_123",
      requestId: "req_test_capacity",
      agentType: "homepage_intelligence",
      raceId: "race_2026_01",
    };

    const output = await generateHomepageIntelligence(
      {
        race: {
          id: "race_2026_01",
          name: "Australian Grand Prix",
          round: 1,
          season: 2026,
        },
      },
      agentContext,
      "ver_1",
    );

    assert.equal(output.isFallback, true);
    assert.equal(output.fallbackReason, "PROVIDER_RATE_LIMITED");
    assert.ok(output.data.raceBrief.headline.length > 0);
  });
});

describe("Two-Tier Caching & Key Isolation", () => {
  beforeEach(() => {
    resetMemoryCache();
  });

  test("computes deterministic dataVersion hashes", () => {
    const v1 = computeDataVersion(["race_1", "2026-03-01T00:00:00Z", "model_v1"]);
    const v2 = computeDataVersion(["race_1", "2026-03-01T00:00:00Z", "model_v1"]);
    const v3 = computeDataVersion(["race_1", "2026-03-01T00:00:00Z", "model_v2"]);

    assert.equal(v1, v2);
    assert.notEqual(v1, v3);
  });

  test("generates distinct global and user-isolated personal keys", () => {
    const globalKey = buildGlobalCacheKey("race_1", "hash123");
    const user1Key = buildPersonalCacheKey("user_alice", "race_1", "hash123");
    const user2Key = buildPersonalCacheKey("user_bob", "race_1", "hash123");

    assert.equal(globalKey, "ai:global:race_1:hash123");
    assert.equal(user1Key, "ai:personal:user_alice:race_1:hash123");
    assert.equal(user2Key, "ai:personal:user_bob:race_1:hash123");
    assert.notEqual(user1Key, user2Key);
  });

  test("stores and retrieves from L1 memory cache with TTL", async () => {
    const key = "ai:global:test:v1";
    const payload = { test: true };

    await setCachedIntelligence(key, payload, "v1", 3600);
    const cached = await getCachedIntelligence<typeof payload>(key);
    assert.deepEqual(cached, payload);

    // Expired item returns null
    await setCachedIntelligence("ai:global:expired:v1", payload, "v1", -10);
    const expired = await getCachedIntelligence("ai:global:expired:v1");
    assert.equal(expired, null);
  });
});

describe("Guardrails & Action Type Sanitization", () => {
  test("preserves valid action types", () => {
    assert.equal(sanitizeActionType("MAKE_PREDICTION"), "MAKE_PREDICTION");
    assert.equal(sanitizeActionType("EXPLORE_RACE"), "EXPLORE_RACE");
    assert.equal(sanitizeActionType("VIEW_MODEL"), "VIEW_MODEL");
  });

  test("sanitizes dangerous or unknown action types to MAKE_PREDICTION", () => {
    assert.equal(sanitizeActionType("DELETE_ACCOUNT"), "MAKE_PREDICTION");
    assert.equal(sanitizeActionType("EXECUTE_SQL"), "MAKE_PREDICTION");
    assert.equal(sanitizeActionType("https://evil.com"), "MAKE_PREDICTION");
    assert.equal(sanitizeActionType(null), "MAKE_PREDICTION");
    assert.equal(sanitizeActionType(undefined), "MAKE_PREDICTION");
  });
});

describe("Structured Context Builder", () => {
  test("creates structured prompt with explicit boundaries", () => {
    const ctx = buildHomepageContext({
      race: {
        id: "r1",
        name: "Bahrain Grand Prix",
        round: 1,
        season: 2026,
      },
      communityPosts: [
        { title: "Who takes pole position?", groupName: "Ferrari Fans" },
      ],
    });

    assert.ok(ctx.includes("<STRUCTURED_F1_DATA>"));
    assert.ok(ctx.includes("</STRUCTURED_F1_DATA>"));
    assert.ok(ctx.includes("<UNTRUSTED_COMMUNITY_DATA>"));
    assert.ok(ctx.includes("</UNTRUSTED_COMMUNITY_DATA>"));
    assert.ok(ctx.includes("[Community: Ferrari Fans] Who takes pole position?"));
  });
});
