// The one card state every prediction surface renders from, and the trend aggregate the batched
// endpoint returns for every card at once.

import { describe, test } from "node:test";
import assert from "node:assert/strict";
import { aggregatePredictionTrend, predictionCardState } from "../groupPredictionTypes";

const LOCK = "2026-10-03T14:00:00+00:00";
const BEFORE = Date.parse(LOCK) - 1;
const AFTER = Date.parse(LOCK) + 1;
const round = { status: "open" as const, lockAt: LOCK, raceStatus: "upcoming", type: "winner" as const, entryPoints: 20 };
const member = { isMember: true, hasEntered: false, pointsBalance: 100, driverCount: 20 };

describe("predictionCardState", () => {
  test("open before the deadline, locked after it, awaiting a result once the race has run", () => {
    assert.equal(predictionCardState(round, member, BEFORE), "open");
    assert.equal(predictionCardState(round, member, AFTER), "locked");
    assert.equal(predictionCardState({ ...round, raceStatus: "completed" }, member, AFTER), "awaiting_result");
  });

  test("settled rounds say so whatever the viewer", () => {
    assert.equal(predictionCardState({ ...round, status: "resolved" }, { ...member, isMember: false }, BEFORE), "resolved");
    assert.equal(predictionCardState({ ...round, status: "void" }, member, BEFORE), "void");
  });

  test("an open round names why this viewer can't enter", () => {
    assert.equal(predictionCardState(round, { ...member, isMember: false }, BEFORE), "not_member");
    assert.equal(predictionCardState(round, { ...member, driverCount: 0 }, BEFORE), "no_lineup");
    assert.equal(predictionCardState({ ...round, type: "dnf_count" }, { ...member, driverCount: 0 }, BEFORE), "open");
    assert.equal(predictionCardState(round, { ...member, pointsBalance: 19 }, BEFORE), "insufficient_points");
  });

  test("an entry already paid for can be changed on any balance; an unknown balance doesn't block", () => {
    assert.equal(predictionCardState(round, { ...member, hasEntered: true, pointsBalance: 0 }, BEFORE), "open");
    assert.equal(predictionCardState(round, { ...member, pointsBalance: null }, BEFORE), "open");
  });
});

describe("aggregatePredictionTrend", () => {
  const names = new Map([["VER", "Max Verstappen"]]);

  test("no entries is an empty trend, never padded", () => {
    assert.deepEqual(aggregatePredictionTrend("winner", [], names), { total: 0, options: [] });
  });

  test("top four by count, ties by key, the rest grouped as Other", () => {
    const trend = aggregatePredictionTrend("winner", ["VER", "VER", "NOR", "LEC", "HAM", "PIA", "ALO"], names);
    assert.equal(trend.total, 7);
    assert.deepEqual(
      trend.options.map((o) => [o.key, o.count]),
      [["VER", 2], ["ALO", 1], ["HAM", 1], ["LEC", 1], ["__other__", 2]],
    );
    assert.equal(trend.options[0].label, "Max Verstappen");
    assert.equal(trend.options[0].pct, 29);
  });

  test("podium rounds group by the winner pick; retirement counts are labelled", () => {
    assert.deepEqual(aggregatePredictionTrend("podium", [["VER", "NOR", "LEC"]], names).options[0].key, "VER");
    assert.equal(aggregatePredictionTrend("dnf_count", [1], names).options[0].label, "1 retirement");
  });
});
