// The season page's championship maths: progression is built from each round's own points (never final
// standings repeated), and every insight is computed from it.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildProgression, championshipInsights, pointsPerRaceMax, lastCompletedIndex, positionChanges, recentPoints } from "../championship";
import type { RaceSummary } from "../../_service/season.pure";

const res = (driver: string, team: string, points: number, pos: number) => ({ driver, driverName: driver.toLowerCase(), team, finishPosition: pos, points, grid: pos, status: "finished" as const });
const race = (round: number, state: RaceSummary["state"], results: ReturnType<typeof res>[] = []) =>
  ({ round, name: `R${round} Grand Prix`, trackShort: `T${round}`, state, results }) as unknown as RaceSummary;

const season = [
  race(1, "completed", [res("ANT", "Mercedes", 25, 1), res("RUS", "Mercedes", 18, 2), res("LEC", "Ferrari", 15, 3)]),
  race(2, "completed", [res("LEC", "Ferrari", 25, 1), res("RUS", "Mercedes", 18, 2), res("ANT", "Mercedes", 1, 10)]),
  race(3, "completed", [res("RUS", "Mercedes", 25, 1), res("LEC", "Ferrari", 18, 2), res("ANT", "Mercedes", 15, 3)]),
  race(4, "next"),
  race(5, "upcoming"),
];

describe("buildProgression", () => {
  it("accumulates each round's own points and leaves future rounds empty", () => {
    const { rounds, series } = buildProgression(season, "drivers");
    const by = Object.fromEntries(series.map((s) => [s.id, s.points]));
    assert.deepEqual(by.ANT, [25, 26, 41, null, null]);
    assert.deepEqual(by.RUS, [18, 36, 61, null, null]);
    assert.deepEqual(by.LEC, [15, 40, 58, null, null]);
    assert.equal(lastCompletedIndex(rounds), 2);
    assert.deepEqual(series.map((s) => s.id), ["RUS", "LEC", "ANT"], "sorted by current points");
  });

  it("sums both cars for constructors", () => {
    const { series } = buildProgression(season, "constructors");
    const merc = series.find((s) => s.id === "Mercedes")!;
    assert.deepEqual(merc.points, [43, 62, 102, null, null]);
  });
});

describe("positionChanges and recentPoints", () => {
  it("measures places gained since the previous round", () => {
    const { rounds, series } = buildProgression(season, "drivers");
    const ch = positionChanges(series, rounds);
    // after R2: LEC 40, RUS 36, ANT 26. after R3: RUS 61, LEC 58, ANT 41.
    assert.equal(ch.get("RUS"), 1);
    assert.equal(ch.get("LEC"), -1);
    assert.equal(ch.get("ANT"), 0);
  });
  it("sums the last n completed rounds", () => {
    const { rounds, series } = buildProgression(season, "drivers");
    const lec = series.find((s) => s.id === "LEC")!;
    assert.equal(recentPoints(lec, rounds, 2), 43);
    assert.equal(recentPoints(lec, rounds, 10), 58);
  });
});

describe("pointsPerRaceMax", () => {
  it("includes the fastest-lap point only in 2019-2024", () => {
    assert.equal(pointsPerRaceMax(2018), 25);
    assert.equal(pointsPerRaceMax(2019), 26);
    assert.equal(pointsPerRaceMax(2024), 26);
    assert.equal(pointsPerRaceMax(2025), 25);
    assert.equal(pointsPerRaceMax(2026), 25);
  });
  it("caps a constructor at a one-two per race", () => {
    const ins = championshipInsights(season, "constructors", 2026).find((i) => i.id === "remaining");
    assert.equal(ins?.value, `${2 * 43} pts`);
  });
});

describe("championshipInsights", () => {
  it("only states what the data supports, with the measurement", () => {
    const ins = Object.fromEntries(championshipInsights(season, "drivers", 2026).map((i) => [i.id, i]));
    assert.equal(ins["last-round"].value, "+25");
    assert.equal(ins["last-round"].detail, "rus");
    assert.equal(ins.lead.value, "3 pts");
    assert.match(ins.lead.detail, /\+7 since round 2/);
    assert.equal(ins.closest.value, "3 pts");
    assert.equal(ins.remaining.value, `${2 * 25} pts`, "no fastest-lap point from 2025");
    assert.equal(ins.remaining.title, "Still to play for");
    for (const i of Object.values(ins)) assert.ok(i.basis.length > 10, `${i.id} explains itself`);
  });
  it("does not count a cancelled round as still to run", () => {
    const withCancelled = [...season, { ...race(6, "upcoming"), weekendStatus: "cancelled" } as unknown as RaceSummary];
    const ins = championshipInsights(withCancelled, "drivers", 2026).find((i) => i.id === "remaining");
    assert.equal(ins?.value, `${2 * 25} pts`, "rounds 4 and 5 only");
    const finished = [...season.slice(0, 3), { ...race(4, "upcoming"), weekendStatus: "cancelled" } as unknown as RaceSummary];
    assert.equal(championshipInsights(finished, "drivers", 2026).find((i) => i.id === "remaining"), undefined, "a finished season has nothing left to play for");
  });
  it("says nothing before the first round", () => {
    assert.deepEqual(championshipInsights([race(1, "next"), race(2, "upcoming")], "drivers", 2026), []);
  });
});
