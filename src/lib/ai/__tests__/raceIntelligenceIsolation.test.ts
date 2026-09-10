// Regression coverage for the race-intelligence single-flight cross-user leak fix (see
// api/ai/race-intelligence/route.ts's generationKey comment). Exercises real concurrent execution
// of withSingleFlight (not just key construction) - two different users, two different personal
// contexts, requesting the same cold race at the same time.

import { test, describe } from "node:test";
import assert from "node:assert/strict";
import { buildPersonalRaceCacheKey, buildSharedRaceCacheKey, withSingleFlight } from "../cache";

describe("Race Intelligence - single-flight cache-key isolation", () => {
  test("shared race cache key is stable across users; personal race cache keys differ per user", () => {
    const shared1 = buildSharedRaceCacheKey("race_1", "v1");
    const shared2 = buildSharedRaceCacheKey("race_1", "v1");
    assert.equal(shared1, shared2, "same race+dataVersion must produce the same shared key - it's meant to be reused by every visitor");

    const personalAlice = buildPersonalRaceCacheKey("race_1", "user_alice", "driver_norris", "team_mclaren", "v1");
    const personalBob = buildPersonalRaceCacheKey("race_1", "user_bob", "driver_verstappen", "team_redbull", "v1");
    assert.notEqual(personalAlice, personalBob, "different users must never share a personal cache key");
  });

  test("two concurrent users with different favorites on a cold race each get their OWN personal insight (the fix under test)", async () => {
    const personalAlice = buildPersonalRaceCacheKey("race_cold", "user_alice", "driver_norris", "team_mclaren", "v1");
    const personalBob = buildPersonalRaceCacheKey("race_cold", "user_bob", "driver_verstappen", "team_redbull", "v1");

    // Mirrors route.ts's real (post-fix) generationKey logic: `needPersonal ? personalCacheKey : sharedCacheKey`.
    // Both Alice and Bob want personal content on this cold race, so both key on their OWN personalCacheKey.
    assert.notEqual(personalAlice, personalBob);

    let aliceGenerateCalls = 0;
    let bobGenerateCalls = 0;

    const [aliceResult, bobResult] = await Promise.all([
      withSingleFlight(personalAlice, async () => {
        aliceGenerateCalls++;
        await new Promise((resolve) => setTimeout(resolve, 25)); // overlaps with Bob's call below
        return { shared: { headline: "Verstappen wins in Hungary" }, personal: { title: "Norris insight" } };
      }),
      withSingleFlight(personalBob, async () => {
        bobGenerateCalls++;
        await new Promise((resolve) => setTimeout(resolve, 25));
        return { shared: { headline: "Verstappen wins in Hungary" }, personal: { title: "Verstappen insight" } };
      }),
    ]);

    assert.equal(aliceGenerateCalls, 1, "Alice's own generate() must actually run");
    assert.equal(bobGenerateCalls, 1, "Bob's own generate() must actually run - NOT skipped in favor of Alice's in-flight promise");
    assert.equal(aliceResult.personal.title, "Norris insight", "Alice must receive her own personal insight");
    assert.equal(bobResult.personal.title, "Verstappen insight", "Bob must receive his own personal insight");
    assert.notEqual(aliceResult.personal.title, bobResult.personal.title, "neither user may receive the other's personal content");
  });

  test("REGRESSION: the OLD key scheme (sharedCacheKey only, ignoring who needs personal content) really would have collapsed two users - this is the bug that was fixed", async () => {
    const sharedCacheKeyOnly = buildSharedRaceCacheKey("race_cold_old_bug", "v1");
    let generateCalls = 0;

    // Both Alice and Bob's requests would have computed this SAME key under the old
    // `needShared ? sharedCacheKey : personalCacheKey!` logic, since needShared=true for both on a
    // cold race - regardless of their different personal contexts.
    const [aliceResult, bobResult] = await Promise.all([
      withSingleFlight(sharedCacheKeyOnly, async () => {
        generateCalls++;
        await new Promise((resolve) => setTimeout(resolve, 20));
        return { personal: { title: "Norris insight" } }; // built from Alice's own favorite driver
      }),
      withSingleFlight(sharedCacheKeyOnly, async () => {
        generateCalls++;
        return { personal: { title: "Verstappen insight" } }; // Bob's own generate() closure - never actually runs
      }),
    ]);

    assert.equal(generateCalls, 1, "only ONE generate() call happens under the old key scheme - the second caller's own closure is discarded");
    assert.equal(aliceResult.personal.title, bobResult.personal.title, "both users silently received the SAME personal content under the old key scheme - this was the real leak");
  });
});
