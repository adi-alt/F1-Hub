// The client-side statement of the deadline rule (src/lib/groupPredictionTypes.ts). The server is the
// authority - enter_prediction() refuses late entries whatever the client shows - but every card
// renders from this, so it must agree with the database exactly, boundary included.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { msUntilLock, predictionStateAt } from "../groupPredictionTypes";

const LOCK = "2026-10-03T14:00:00+00:00";
const LOCK_MS = Date.parse(LOCK);

describe("predictionStateAt", () => {
  test("open strictly before the deadline; locked at and after it (same boundary as the database)", () => {
    assert.equal(predictionStateAt("open", LOCK, LOCK_MS - 1), "open");
    assert.equal(predictionStateAt("open", LOCK, LOCK_MS), "locked");
    assert.equal(predictionStateAt("open", LOCK, LOCK_MS + 1), "locked");
  });

  test("an unknown or unparsable deadline is closed, never open-ended", () => {
    assert.equal(predictionStateAt("open", null, 0), "locked");
    assert.equal(predictionStateAt("open", "not a date", 0), "locked");
  });

  test("a stored locked or resolved status wins over an early clock", () => {
    assert.equal(predictionStateAt("locked", LOCK, 0), "locked");
    assert.equal(predictionStateAt("resolved", LOCK, 0), "resolved");
    assert.equal(predictionStateAt("resolved", null, 0), "resolved");
  });

  test("zone-qualified strings from the database compare as instants, not wall-clock text", () => {
    assert.equal(predictionStateAt("open", "2026-10-03T16:00:00+02:00", LOCK_MS - 1), "open");
    assert.equal(predictionStateAt("open", "2026-10-03T16:00:00+02:00", LOCK_MS), "locked");
  });
});

describe("msUntilLock", () => {
  test("positive before, zero at, negative after; null when unknown", () => {
    assert.equal(msUntilLock(LOCK, LOCK_MS - 5000), 5000);
    assert.equal(msUntilLock(LOCK, LOCK_MS), 0);
    assert.equal(msUntilLock(LOCK, LOCK_MS + 5000), -5000);
    assert.equal(msUntilLock(null, 0), null);
    assert.equal(msUntilLock("garbage", 0), null);
  });
});
