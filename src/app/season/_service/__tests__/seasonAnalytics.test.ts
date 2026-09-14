import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildRaceInsights,
  buildSeasonTimeline,
  computeMomentum,
  computeTeamTrends,
  findMomentumShift,
  recentPointsSeries,
  type TimelinePoint,
} from "../seasonAnalytics";
import type { ConstructorStandingRow, DriverStandingRow, RaceSummary } from "../season.pure";

function race(round: number, over: Partial<RaceSummary> = {}): RaceSummary {
  return {
    round,
    name: `Round ${round} GP`,
    trackShort: `R${round}`,
    raceDate: `2026-01-0${round}T13:00:00`,
    state: "completed",
    sessions: [],
    poleSitter: null,
    results: [],
    hasQualifying: true,
    circuit: "Testville",
    country: "Testland",
    eventFormat: "conventional",
    isSprintWeekend: false,
    weekendStatus: "completed",
    photoUrls: [],
    circuitPhotoUrls: [],
    forecast: null,
    raceWeather: null,
    podium: [],
    winnerName: null,
    poleSitterName: null,
    fastestLap: null,
    predicted: null,
    ...over,
  };
}

const ALPHA = { driver: "ALP", driverName: "Ana Alpha", team: "Vega" };
const BRAVO = { driver: "BRV", driverName: "Ben Bravo", team: "Orion" };

// Standings order matters: drivers[0] is the championship leader, and buildRaceInsights reads it
// as such. Listing them out of order would make the fixture describe a table that can't exist.
const drivers: DriverStandingRow[] = [
  { driver: "BRV", driverName: "Ben Bravo", team: "Orion", points: 80, wins: 2, podiums: 3, headshotUrl: null, teamLogoUrl: null, favoriteId: "ben" },
  { driver: "ALP", driverName: "Ana Alpha", team: "Vega", points: 74, wins: 2, podiums: 3, headshotUrl: null, teamLogoUrl: null, favoriteId: "ana" },
];

const constructors: ConstructorStandingRow[] = [
  { team: "Orion", points: 80, wins: 2, podiums: 3, logoUrl: null, favoriteId: "orion" },
  { team: "Vega", points: 74, wins: 2, podiums: 3, logoUrl: null, favoriteId: "vega" },
];

const races: RaceSummary[] = [
  race(1, { winnerName: "Ana Alpha", results: [
    { ...ALPHA, finishPosition: 1, points: 25, grid: 1, status: "finished" },
    { ...BRAVO, finishPosition: 2, points: 18, grid: 2, status: "finished" }] }),
  race(2, { winnerName: "Ben Bravo", results: [
    { ...BRAVO, finishPosition: 1, points: 25, grid: 3, status: "finished" },
    { ...ALPHA, finishPosition: 5, points: 12, grid: 1, status: "finished" }] }),
  race(3, { winnerName: "Ben Bravo", poleSitter: "BRV", poleSitterName: "Ben Bravo", results: [
    { ...BRAVO, finishPosition: 1, points: 25, grid: 1, status: "finished" },
    { ...ALPHA, finishPosition: 5, points: 12, grid: 2, status: "finished" }] }),
  race(4, { winnerName: "Ana Alpha", results: [
    { ...ALPHA, finishPosition: 1, points: 25, grid: 1, status: "finished" },
    { ...BRAVO, finishPosition: 4, points: 12, grid: 2, status: "finished" }] }),
];

// Cumulative points per round, the shape computeChampionshipProgression produces.
const progression = [
  { round: 1, raceName: "Round 1 GP", ALP: 25, BRV: 18 },
  { round: 2, raceName: "Round 2 GP", ALP: 37, BRV: 43 },
  { round: 3, raceName: "Round 3 GP", ALP: 49, BRV: 68 },
  { round: 4, raceName: "Round 4 GP", ALP: 74, BRV: 80 },
];

describe("buildSeasonTimeline", () => {
  const timeline = buildSeasonTimeline(drivers, races, progression);

  it("ranks each round on that round's own points, not the final order", () => {
    assert.equal(timeline[0].leader, "Ana Alpha", "Alpha led after round 1 even though Bravo finishes ahead overall");
    assert.equal(timeline[3].leader, "Ben Bravo");
  });

  it("reports the real gap at the top after each round", () => {
    assert.deepEqual(timeline.map((t) => t.gap), [7, 6, 19, 6]);
  });

  it("carries each round's winner", () => {
    assert.deepEqual(timeline.map((t) => t.winner), ["Ana Alpha", "Ben Bravo", "Ben Bravo", "Ana Alpha"]);
  });
});

describe("findMomentumShift", () => {
  it("identifies the round the lead actually changed hands", () => {
    const shift = findMomentumShift(buildSeasonTimeline(drivers, races, progression));
    assert.notEqual(shift, null);
    assert.equal(shift!.round, 2);
    assert.equal(shift!.leadChanged, true);
    assert.equal(shift!.leaderBefore, "Ana Alpha");
    assert.equal(shift!.leaderAfter, "Ben Bravo");
    // Crossing from 7 ahead to 6 behind is a 13-point swing, not a 1-point one.
    assert.equal(shift!.swing, 13);
  });

  // A lead change is unambiguously the moment a championship turns, so it outranks any pure gap
  // movement even when the raw number is smaller.
  it("prefers a lead change over a larger gap swing that kept the same leader", () => {
    const flat: TimelinePoint[] = [
      { round: 1, raceName: "R1", leader: "A", leaderPoints: 25, second: "B", secondPoints: 5, gap: 20, winner: "A" },
      { round: 2, raceName: "R2", leader: "A", leaderPoints: 50, second: "B", secondPoints: 8, gap: 42, winner: "A" },
      { round: 3, raceName: "R3", leader: "B", leaderPoints: 60, second: "A", secondPoints: 58, gap: 2, winner: "B" },
    ];
    const shift = findMomentumShift(flat)!;
    assert.equal(shift.round, 3, "the 22-point swing at R2 must not outrank the lead change at R3");
    assert.equal(shift.leadChanged, true);
  });

  it("picks the largest swing when the lead never changed", () => {
    const steady: TimelinePoint[] = [
      { round: 1, raceName: "R1", leader: "A", leaderPoints: 25, second: "B", secondPoints: 18, gap: 7, winner: "A" },
      { round: 2, raceName: "R2", leader: "A", leaderPoints: 50, second: "B", secondPoints: 24, gap: 26, winner: "A" },
      { round: 3, raceName: "R3", leader: "A", leaderPoints: 60, second: "B", secondPoints: 52, gap: 8, winner: "B" },
    ];
    const shift = findMomentumShift(steady)!;
    assert.equal(shift.round, 2);
    assert.equal(shift.swing, 19);
    assert.equal(shift.leadChanged, false);
  });

  it("returns null rather than inventing a turning point in a season too young to have one", () => {
    assert.equal(findMomentumShift([]), null);
    assert.equal(findMomentumShift(buildSeasonTimeline(drivers, races, progression).slice(0, 2)), null);
  });
});

describe("computeMomentum", () => {
  it("ranks by the recent window, not the championship table", () => {
    const momentum = computeMomentum(drivers, races);
    const alpha = momentum.find((m) => m.name === "Ana Alpha")!;
    const bravo = momentum.find((m) => m.name === "Ben Bravo")!;
    // Last 3 rounds: Alpha 12+12+25 = 49, Bravo 25+25+12 = 62.
    assert.equal(alpha.last3, 49);
    assert.equal(bravo.last3, 62);
    assert.equal(alpha.last5, 74, "only four rounds exist, so the 5-round window is the whole season");
  });
});

describe("computeTeamTrends", () => {
  it("compares early rounds against recent ones and sorts by improvement", () => {
    const trends = computeTeamTrends(constructors, races);
    assert.equal(trends.length, 2);
    assert.equal(trends[0].delta >= trends[1].delta, true, "sorted most-improved first");
    for (const t of trends) assert.equal(Number.isFinite(t.delta), true);
  });

  it("declines to compare a season too short to have two halves", () => {
    assert.deepEqual(computeTeamTrends(constructors, races.slice(0, 2)), []);
  });
});

describe("recentPointsSeries", () => {
  it("accumulates from the start of the season, not the start of the window", () => {
    const series = recentPointsSeries("ALP", races, false, 2);
    assert.deepEqual(series.map((p) => p.round), [3, 4]);
    assert.deepEqual(series.map((p) => p.points), [12, 25]);
    // 25 + 12 already banked before the window opens, so the line starts at 49 and not at 12.
    assert.deepEqual(series.map((p) => p.cumulative), [49, 74]);
  });

  it("never decreases, which is why the sparkline reads acceleration rather than direction", () => {
    const series = recentPointsSeries("BRV", races, false);
    for (let i = 1; i < series.length; i++) assert.equal(series[i].cumulative >= series[i - 1].cumulative, true);
  });
});

describe("buildRaceInsights", () => {
  it("says a winner converted pole when they did", () => {
    const insights = buildRaceInsights(races[2], drivers);
    assert.match(insights[0].text, /Ben Bravo converted pole/);
  });

  it("credits a win from further back with the places made up", () => {
    const insights = buildRaceInsights(races[1], drivers);
    assert.match(insights[0].text, /won from P3, making up 2 places/);
  });

  it("never describes a result for a race that hasn't run", () => {
    const upcoming = race(9, { state: "upcoming", weekendStatus: "upcoming", results: [], winnerName: null });
    const text = buildRaceInsights(upcoming, drivers).map((i) => i.text).join(" ");
    assert.equal(/won|winner|finished/i.test(text), false, text);
    assert.match(text, /Ben Bravo leads Ana Alpha by 6 points coming in/);
  });

  it("states a cancelled round plainly instead of previewing it", () => {
    const off = race(9, { weekendStatus: "cancelled" });
    const insights = buildRaceInsights(off, drivers);
    assert.equal(insights.length, 1);
    assert.match(insights[0].text, /cancelled/);
  });

  it("returns at most three", () => {
    assert.equal(buildRaceInsights(races[1], drivers).length <= 3, true);
  });
});
