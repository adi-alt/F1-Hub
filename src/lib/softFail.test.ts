import { test } from "node:test";
import assert from "node:assert/strict";
import { softFail } from "./softFail";

test("softFail passes a successful load through", async () => {
  assert.deepEqual(await softFail("x", Promise.resolve([1]), []), [1]);
});

test("softFail logs a failed load and resolves to the fallback instead of throwing", async (t) => {
  const logged = t.mock.method(console, "error", () => {});
  const fallback = { mode: "discover" as const, communities: [] };
  const result = await softFail("race communities", Promise.reject(new Error("column profiles.avatar does not exist")), fallback);
  assert.equal(result, fallback);
  assert.equal(logged.mock.callCount(), 1);
  assert.match(String(logged.mock.calls[0].arguments[0]), /race communities/);
});

test("the race page loads every non-essential section through softFail", async () => {
  const { readFileSync } = await import("node:fs");
  const src = readFileSync(new URL("../app/race/page.tsx", import.meta.url), "utf8");
  for (const fn of ["listRaceCommunities", "getApprovedRacePhotos", "getRaceLayout", "getRacePicks", "loadEventHistory"]) {
    const calls = src.match(new RegExp(`\\b${fn}\\(`, "g"))?.length ?? 0;
    const wrapped = src.match(new RegExp(`softFail\\("[^"]+", ${fn}\\(`, "g"))?.length ?? 0;
    assert.ok(calls > 0, `${fn} is called`);
    assert.equal(wrapped, calls, `every ${fn} call fails soft`);
  }
});
