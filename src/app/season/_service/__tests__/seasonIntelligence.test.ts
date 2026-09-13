import { describe, it } from "node:test";
import assert from "node:assert/strict";
import {
  buildComparePair,
  buildPersonalSeasonContext,
  buildPredictionReview,
  buildSeasonSnapshot,
  buildBattles,
  completedRoundCount,
  type ConstructorStandingRow,
  type DriverStandingRow,
  type RaceSummary,
} from "../season.pure";

// A small, fully-specified season: three completed rounds, two upcoming. Every assertion below is
// checkable by hand against this fixture rather than against whatever the code happens to do.
function race(round: number, over: Partial<RaceSummary> = {}): RaceSummary {
  return {
    round,
    name: `Round ${round} GP`,
    trackShort: `R${round}`,
    raceDate: `2026-0${round}-01T13:00:00`,
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

const races: RaceSummary[] = [
  race(1, {
    poleSitter: "ALP",
    results: [
      { ...ALPHA, finishPosition: 1, points: 25, grid: 1, status: "finished" },
      { ...BRAVO, finishPosition: 2, points: 18, grid: 2, status: "finished" },
    ],
  }),
  race(2, {
    poleSitter: "BRV",
    results: [
      { ...BRAVO, finishPosition: 1, points: 25, grid: 1, status: "finished" },
      { ...ALPHA, finishPosition: 3, points: 15, grid: 3, status: "finished" },
    ],
  }),
  race(3, {
    poleSitter: "ALP",
    results: [
      { ...ALPHA, finishPosition: 1, points: 25, grid: 1, status: "finished" },
      { ...BRAVO, finishPosition: 18, points: 0, grid: 2, status: "dnf" },
    ],
  }),
  race(4, { state: "upcoming", weekendStatus: "upcoming", results: [], poleSitter: null }),
  race(5, { state: "next", weekendStatus: "upcoming", results: [], poleSitter: null }),
];

const drivers: DriverStandingRow[] = [
  { driver: "ALP", driverName: "Ana Alpha", team: "Vega", points: 65, wins: 2, podiums: 3, headshotUrl: null, teamLogoUrl: null, favoriteId: "ana-alpha" },
  { driver: "BRV", driverName: "Ben Bravo", team: "Orion", points: 43, wins: 1, podiums: 2, headshotUrl: null, teamLogoUrl: null, favoriteId: "ben-bravo" },
];

const constructors: ConstructorStandingRow[] = [
  { team: "Vega", points: 65, wins: 2, podiums: 3, logoUrl: null, favoriteId: "vega" },
  { team: "Orion", points: 43, wins: 1, podiums: 2, logoUrl: null, favoriteId: "orion" },
];

describe("completed rounds are defined in exactly one place", () => {
  it("counts only rounds with a classified result", () => {
    assert.equal(completedRoundCount(races), 3);
  });
});

describe("buildComparePair", () => {
  it("resolves both sides from the ids it was given, in the order it was given them", () => {
    const pair = buildComparePair(2026, "drivers", "ALP", "BRV", drivers, constructors, races);
    assert.ok(pair);
    assert.equal(pair.a.id, "ALP");
    assert.equal(pair.a.name, "Ana Alpha");
    assert.equal(pair.b.id, "BRV");
    assert.equal(pair.b.name, "Ben Bravo");
  });

  it("computes per-side statistics from completed rounds only", () => {
    const pair = buildComparePair(2026, "drivers", "ALP", "BRV", drivers, constructors, races)!;
    assert.equal(pair.a.scoredRounds, 3);
    assert.equal(pair.a.poles, 2);
    assert.equal(pair.b.poles, 1);
    assert.equal(pair.a.dnfs, 0);
    assert.equal(pair.b.dnfs, 1);
    // (1 + 3 + 1) / 3
    assert.equal(pair.a.averageFinish, 5 / 3);
    assert.equal(pair.a.bestFinish, 1);
  });

  it("derives momentum deterministically from recent points, never from the model", () => {
    const pair = buildComparePair(2026, "drivers", "ALP", "BRV", drivers, constructors, races)!;
    assert.equal(pair.a.recentPoints, 65);
    assert.equal(pair.b.recentPoints, 43);
    assert.equal(pair.momentum, "A");

    const reversed = buildComparePair(2026, "drivers", "BRV", "ALP", drivers, constructors, races)!;
    assert.equal(reversed.momentum, "B", "momentum must follow the display order, not the entity");
  });

  it("reports head-to-head as race classification, separate from points", () => {
    const pair = buildComparePair(2026, "drivers", "ALP", "BRV", drivers, constructors, races)!;
    assert.equal(pair.h2h.aWins, 2);
    assert.equal(pair.h2h.bWins, 1);
    assert.equal(pair.h2h.comparableRounds, 3);
    assert.equal(pair.pointsGap, 22, "points gap and head-to-head are different metrics");
  });

  it("refuses an unknown or self-referential pair rather than inventing one", () => {
    assert.equal(buildComparePair(2026, "drivers", "ALP", "ALP", drivers, constructors, races), null);
    assert.equal(buildComparePair(2026, "drivers", "ALP", "NOPE", drivers, constructors, races), null);
    assert.equal(buildComparePair(2026, "drivers", "", "BRV", drivers, constructors, races), null);
  });

  it("treats a team's weekend as its best finish and both cars' points", () => {
    const pair = buildComparePair(2026, "constructors", "Vega", "Orion", drivers, constructors, races)!;
    assert.equal(pair.a.poles, null, "poles are a driver statistic");
    assert.equal(pair.a.scoredRounds, 3);
  });
});

describe("buildSeasonSnapshot", () => {
  const battles = buildBattles(drivers, constructors, races);
  const items = buildSeasonSnapshot(drivers, races, battles);

  it("produces leader, challenger, form and battle, each with a reason", () => {
    assert.deepEqual(items.map((i) => i.key), ["leader", "challenger", "form", "battle"]);
    for (const item of items) assert.ok(item.reason.length > 0, `${item.key} must explain itself`);
  });

  it("reads the gap rather than always saying the same thing", () => {
    const leader = items.find((i) => i.key === "leader")!;
    assert.equal(leader.name, "Ana Alpha");
    assert.equal(leader.reason, "Holds the advantage", "a 22-point lead is not 'controls the championship'");
  });

  it("states the challenger's deficit, not their total", () => {
    const challenger = items.find((i) => i.key === "challenger")!;
    assert.equal(challenger.value, "22 pts behind");
  });

  it("gives every item a destination to click through to", () => {
    for (const item of items) assert.ok(item.target, `${item.key} must be actionable`);
  });
});

describe("buildPersonalSeasonContext", () => {
  const progression = [
    { round: 1, ALP: 25, BRV: 18 },
    { round: 2, ALP: 40, BRV: 43 },
    { round: 3, ALP: 65, BRV: 43 },
  ];

  it("is empty when the reader follows nobody, so no personal UI renders at all", () => {
    const ctx = buildPersonalSeasonContext([], [], drivers, constructors, races, progression);
    assert.equal(ctx.hasFavorites, false);
    assert.equal(ctx.companion, null);
    assert.deepEqual(ctx.highlights, []);
  });

  it("maps archive favorite ids into this page's own code space", () => {
    const ctx = buildPersonalSeasonContext(["ana-alpha"], [], drivers, constructors, races, progression);
    assert.deepEqual(ctx.driverCodes, ["ALP"]);
    assert.equal(ctx.hasFavorites, true);
  });

  it("leads the companion line with a real position move when there was one", () => {
    const ctx = buildPersonalSeasonContext(["ana-alpha"], [], drivers, constructors, races, progression);
    assert.ok(ctx.companion);
    assert.match(ctx.companion, /Ana Alpha moved up 1 place to P1/);
    assert.match(ctx.companion, /strongest recent scoring run/, "Alpha is also the form driver here");
  });

  it("never leaks implementation vocabulary into reader-facing copy", () => {
    const ctx = buildPersonalSeasonContext(["ana-alpha"], ["vega"], drivers, constructors, races, progression);
    const text = [ctx.companion ?? "", ...ctx.highlights.map((h) => h.line)].join(" ").toLowerCase();
    for (const word of ["deterministic", "fallback", "cache", "model unavailable", "ai "]) {
      assert.ok(!text.includes(word), `personal copy must not mention "${word}"`);
    }
  });
});

describe("buildPredictionReview", () => {
  const completed = race(9, {
    poleSitter: "BRV",
    results: [
      { ...ALPHA, finishPosition: 1, points: 25, grid: 2, status: "finished" },
      { ...BRAVO, finishPosition: 2, points: 18, grid: 1, status: "finished" },
      { driver: "CHI", driverName: "Cal Chi", team: "Lyra", finishPosition: 3, points: 15, grid: 3, status: "finished" },
    ],
    podium: [
      { position: 1, driver: "ALP", driverName: "Ana Alpha", team: "Vega" },
      { position: 2, driver: "BRV", driverName: "Ben Bravo", team: "Orion" },
      { position: 3, driver: "CHI", driverName: "Cal Chi", team: "Lyra" },
    ],
    predicted: { winner: "BRV", podium: ["BRV", "ALP", "DEL"], pole: "BRV", source: "simulation" },
  });

  it("scores a wrong winner as missed rather than softening it", () => {
    const review = buildPredictionReview(completed)!;
    const winner = review.lines.find((l) => l.label === "Winner")!;
    assert.equal(winner.verdict, "missed");
    assert.equal(winner.predicted, "Ben Bravo");
    assert.equal(winner.actual, "Ana Alpha");
  });

  it("credits a podium on membership, not exact order", () => {
    const review = buildPredictionReview(completed)!;
    const podium = review.lines.find((l) => l.label === "Podium")!;
    assert.equal(podium.verdict, "partial");
    assert.equal(podium.detail, "2 of 3 correct");
  });

  it("scores a correct pole as correct", () => {
    const review = buildPredictionReview(completed)!;
    assert.equal(review.lines.find((l) => l.label === "Pole")!.verdict, "correct");
  });

  it("produces nothing for a round that was never predicted, or that hasn't run", () => {
    assert.equal(buildPredictionReview(race(9, { predicted: null })), null);
    assert.equal(
      buildPredictionReview(race(9, { weekendStatus: "upcoming", predicted: { winner: "ALP", podium: [], pole: null, source: "model" } })),
      null,
    );
  });
});
