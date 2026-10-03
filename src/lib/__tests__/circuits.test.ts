import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateTrackShape } from "../trackShape";
import { describeTrackCharacter, getCircuitFacts, type CircuitFacts } from "../circuitFacts";
import { buildCircuitContext, circuitValidIds, formatCircuitContext } from "../ai/context/circuitContext";
import type { CircuitYearRecord } from "../circuitIntelligence";
import { validateSharedCircuitIntelligence } from "../ai/schemas/seasonIntelligence";
import type { RaceSummary } from "@/app/season/_service/season.pure";
import { resolveCurrentCircuitToArchiveId } from "../circuitSlug";

describe("generateTrackShape", () => {
  it("is deterministic - the same seed always draws the same layout", () => {
    const a = generateTrackShape("Monza", 11, "permanent");
    const b = generateTrackShape("Monza", 11, "permanent");
    assert.equal(a.path, b.path);
    assert.deepEqual(a.startFinish, b.startFinish);
  });

  it("draws visibly different shapes for different circuits", () => {
    const monza = generateTrackShape("Monza", 11, "permanent");
    const monaco = generateTrackShape("Monte Carlo", 19, "street");
    assert.notEqual(monza.path, monaco.path);
  });

  it("the schematic fallback always produces a closed path within its own 0-100 viewBox", () => {
    // "Bahrain" is deliberately a seed circuitShapes.json does NOT cover - this exercises the
    // procedural fallback specifically, not whichever branch the real dataset happens to hit.
    const shape = generateTrackShape("Bahrain", 15, "permanent");
    assert.equal(shape.isAuthentic, false);
    assert.equal(shape.viewBox, "0 0 100 100");
    assert.match(shape.path, /^M .*Z$/, "path must start with a moveto and close with Z");
    // Every coordinate the generator can produce sits inside its own 0-100 viewBox - a shape that
    // draws outside its box would clip against the SVG's own viewBox silently.
    const coords = [...shape.path.matchAll(/(-?\d+\.\d+),(-?\d+\.\d+)/g)].map((m) => [Number(m[1]), Number(m[2])]);
    assert.ok(coords.length > 0);
    for (const [x, y] of coords) {
      assert.ok(x >= 0 && x <= 100, `x=${x} out of bounds`);
      assert.ok(y >= 0 && y <= 100, `y=${y} out of bounds`);
    }
  });

  it("caps turn markers at the ring's own point count rather than fabricating extra points", () => {
    // 30 requested turns still can't exceed the generator's own 8-22 point-count clamp. "Bahrain"
    // again, so this exercises the schematic branch (the only one that produces turn markers at
    // all) rather than whichever circuit circuitShapes.json happens to cover next.
    const shape = generateTrackShape("Bahrain", 27, "street");
    assert.ok(shape.turns.length <= 22);
    assert.equal(shape.turns.length, shape.turns[shape.turns.length - 1]?.number);
  });

  it("prefers real authentic geometry over the schematic fallback when circuitShapes.json covers the circuit", () => {
    // Silverstone is a real, ingested entry - confirms the dataset is actually wired up, not just
    // present on disk unused.
    const shape = generateTrackShape("Silverstone", 18, "permanent");
    assert.equal(shape.isAuthentic, true);
    assert.equal(shape.viewBox, "0 0 1000 1000");
    assert.match(shape.path, /^M/, "an authentic path is still a real SVG path starting with a moveto");
    // Authentic geometry has no evenly-spaced procedural turn markers to fabricate - an empty
    // array here is the honest, documented behavior, not a bug (see generateTrackShape's comment).
    assert.deepEqual(shape.turns, []);
  });

  it("resolves authentic geometry the same way regardless of casing", () => {
    const lower = generateTrackShape("silverstone", 18, "permanent");
    const mixed = generateTrackShape("Silverstone", 18, "permanent");
    assert.equal(lower.path, mixed.path);
    assert.equal(lower.isAuthentic, true);
  });
});

describe("getCircuitFacts", () => {
  it("resolves case-insensitively and across accent variants", () => {
    const a = getCircuitFacts("Montreal");
    const b = getCircuitFacts("montréal");
    const c = getCircuitFacts("MONTRÉAL");
    assert.notEqual(a, null);
    assert.deepEqual(a, b);
    assert.deepEqual(a, c);
  });

  it("returns null rather than guessing for a circuit this table doesn't cover", () => {
    assert.equal(getCircuitFacts("Nowhereville"), null);
  });
});

describe("describeTrackCharacter", () => {
  const monza: CircuitFacts = { venueName: "Monza", lengthKm: 5.793, turns: 11, direction: "clockwise", trackType: "permanent", firstGrandPrix: 1950, nightRace: false, drsZones: 2, lapRecord: null };
  const monaco: CircuitFacts = { venueName: "Monaco", lengthKm: 3.337, turns: 19, direction: "clockwise", trackType: "street", firstGrandPrix: 1950, nightRace: false, drsZones: 1, lapRecord: null };

  it("tags a long, low-turn-count circuit as high-speed", () => {
    assert.ok(describeTrackCharacter(monza, null).includes("High-speed"));
  });

  it("tags a tight, high-turn-count street circuit as low-speed and street", () => {
    const tags = describeTrackCharacter(monaco, null);
    assert.ok(tags.includes("Low-speed"));
    assert.ok(tags.includes("Street circuit"));
  });

  it("only claims high tyre stress when the real historical field movement actually supports it", () => {
    assert.ok(!describeTrackCharacter(monza, null).includes("High tyre stress"), "no data means no claim");
    assert.ok(!describeTrackCharacter(monza, 1.2).includes("High tyre stress"), "low real movement means no claim");
    assert.ok(describeTrackCharacter(monza, 4.5).includes("High tyre stress"), "high real movement earns the tag");
  });
});

describe("buildCircuitContext", () => {
  function race(state: RaceSummary["state"], weekendStatus: RaceSummary["weekendStatus"]): RaceSummary {
    return {
      round: 14,
      name: "Italian Grand Prix",
      trackShort: "MNZ",
      raceDate: "2026-09-06T13:00:00",
      state,
      sessions: [],
      poleSitter: "NOR",
      results: [
        { driver: "ANT", driverName: "Kimi Antonelli", team: "Mercedes", finishPosition: 1, points: 25, grid: 3, status: "finished" },
        { driver: "NOR", driverName: "Lando Norris", team: "McLaren", finishPosition: 2, points: 18, grid: 1, status: "finished" },
      ],
      hasQualifying: true,
      circuit: "Monza",
      country: "Italy",
      eventFormat: null,
      isSprintWeekend: false,
      weekendStatus,
      photoUrls: [],
      circuitPhotoUrls: [],
      forecast: null,
      raceWeather: null,
      podium: [
        { position: 1, driver: "ANT", driverName: "Kimi Antonelli", team: "Mercedes" },
        { position: 2, driver: "NOR", driverName: "Lando Norris", team: "McLaren" },
      ],
      winnerName: "Kimi Antonelli",
      poleSitterName: "Lando Norris",
      fastestLap: null,
      predicted: null,
    };
  }

  it("derives 'completed' only from a completed round, with a real result attached", () => {
    const ctx = buildCircuitContext("Monza", "Autodromo Nazionale Monza", "Italian Grand Prix", "Italy", 2026, null, race("completed", "completed"), []);
    assert.equal(ctx.state, "completed");
    assert.equal(ctx.currentSeasonResult?.winner, "Kimi Antonelli");
    assert.equal(ctx.upcoming, null);
    // Antonelli started 3rd and won - a real, computed +2 place gain, not asserted from nothing.
    assert.deepEqual(ctx.currentSeasonResult?.biggestGainer, { name: "Kimi Antonelli", places: 2 });
  });

  it("evidenceIds carries every real name the formatted context actually shows the model - never an empty list that would silently reject every real citation", () => {
    const ctx = buildCircuitContext("Monza", "Autodromo Nazionale Monza", "Italian Grand Prix", "Italy", 2026, null, race("completed", "completed"), []);
    assert.ok(ctx.evidenceIds.includes("Kimi Antonelli"), "the winner must be a valid citation");
    assert.ok(ctx.evidenceIds.includes("Lando Norris"), "the pole sitter/runner-up must be a valid citation");
    // Deduplicated - Antonelli appears as winner, podium P1, AND biggest gainer, but only once here.
    assert.equal(ctx.evidenceIds.filter((id) => id === "Kimi Antonelli").length, 1);
  });

  it("derives 'next'/'upcoming' from a round that hasn't run, with no result attached", () => {
    const ctx = buildCircuitContext("Monza", "Autodromo Nazionale Monza", "Italian Grand Prix", "Italy", 2026, null, race("next", "upcoming"), []);
    assert.equal(ctx.state, "next");
    assert.equal(ctx.currentSeasonResult, null);
    assert.notEqual(ctx.upcoming, null);
  });

  it("derives 'unscheduled' when the circuit isn't on this year's calendar at all", () => {
    const ctx = buildCircuitContext("Imola", "Autodromo Enzo e Dino Ferrari", null, "Italy", 2026, null, null, []);
    assert.equal(ctx.state, "unscheduled");
    assert.equal(ctx.currentSeasonResult, null);
    assert.equal(ctx.upcoming, null);
  });
});

describe("validateSharedCircuitIntelligence", () => {
  const ctx = buildCircuitContext("Monza", "Autodromo Nazionale Monza", "Italian Grand Prix", "Italy", 2026, null, {
    round: 14,
    name: "Italian Grand Prix",
    trackShort: "MNZ",
    raceDate: "2026-09-06T13:00:00",
    state: "completed",
    sessions: [],
    poleSitter: "NOR",
    results: [{ driver: "ANT", driverName: "Kimi Antonelli", team: "Mercedes", finishPosition: 1, points: 25, grid: 3, status: "finished" }],
    hasQualifying: true,
    circuit: "Monza",
    country: "Italy",
    eventFormat: null,
    isSprintWeekend: false,
    weekendStatus: "completed",
    photoUrls: [],
    circuitPhotoUrls: [],
    forecast: null,
    raceWeather: null,
    podium: [{ position: 1, driver: "ANT", driverName: "Kimi Antonelli", team: "Mercedes" }],
    winnerName: "Kimi Antonelli",
    poleSitterName: "Lando Norris",
    fastestLap: null,
    predicted: null,
  } satisfies RaceSummary, []);

  // Regression test for a real shipped bug: generateCircuitTake once called this validator with a
  // hardcoded `[]` instead of circuitValidIds(context) - every real evidenceId the model ever
  // returned was silently stripped, every time, for every circuit. circuitValidIds(ctx) must
  // return a real, non-empty id space whenever there's real current-season data to cite.
  it("circuitValidIds is never empty when there's real evidence to cite - the exact condition the shipped bug violated", () => {
    assert.ok(circuitValidIds(ctx).length > 0);
  });

  it("keeps a real citation and strips only what the model invented, rather than rejecting the whole response", () => {
    const result = validateSharedCircuitIntelligence(
      {
        trackTake: { headline: "Antonelli wins at Monza", summary: "A real result.", evidenceIds: ["Kimi Antonelli", "Someone Invented"] },
      },
      circuitValidIds(ctx),
    );
    assert.equal(result.valid, true);
    assert.deepEqual(result.data?.trackTake?.evidenceIds, ["Kimi Antonelli"]);
  });

  it("keeps a block's real headline/summary even once every one of its citations gets stripped", () => {
    // Stripping bad evidenceIds down to [] doesn't throw away the real editorial content sitting
    // next to it - only a response with no blocks AT ALL is rejected (see the next test).
    const result = validateSharedCircuitIntelligence(
      { trackTake: { headline: "x", summary: "y", evidenceIds: ["Someone Invented"] } },
      circuitValidIds(ctx),
    );
    assert.equal(result.valid, true);
    assert.equal(result.data?.trackTake?.headline, "x");
    assert.deepEqual(result.data?.trackTake?.evidenceIds, []);
  });

  it("rejects a response with no recognized blocks at all", () => {
    const result = validateSharedCircuitIntelligence({}, circuitValidIds(ctx));
    assert.equal(result.valid, false);
  });
});

describe("resolveCurrentCircuitToArchiveId - the 2026 Bahrain venue", () => {
  // Archive localities as stored (archive_races.locality, checked read-only against the live project).
  const localities = new Map([["bahrain", "Sakhir"], ["sepang", "Kuala Lumpur"], ["albert_park", "Melbourne"]]);

  it("the 2026 Bahrain GP, relocated to Sepang, resolves to Sepang's track history (correct)", () => {
    // FastF1 and the calendar store "Kuala Lumpur" for it; F1 moved the event to Sepang for 2026.
    assert.equal(resolveCurrentCircuitToArchiveId("Kuala Lumpur", localities), "sepang");
  });

  it("a Bahrain GP held at Sakhir still resolves to Bahrain International Circuit", () => {
    assert.equal(resolveCurrentCircuitToArchiveId("Sakhir", localities), "bahrain");
  });
});

describe("buildCircuitContext: what the race page's starter questions need (Ask Apex)", () => {
  const year = (y: number, winnerDriver: string, winnerTeam: string, winnerGrid: number): CircuitYearRecord => ({
    year: y,
    winnerDriver,
    winnerTeam,
    winnerGrid,
    winnerCode: null,
    winnerArchiveDriverId: null,
    poleSitter: null,
    poleCode: null,
    poleArchiveDriverId: null,
    winnerWasPole: winnerGrid === 1,
    winningMarginSec: null,
    fieldMovementAvg: null,
    dryRace: true,
    avgTempC: null,
    raceName: null,
    raceDateIso: null,
    fastestLapSec: null,
    fastestLapDriver: null,
    fastestLapCode: null,
  });
  const timeline = [
    year(2012, "Fernando Alonso", "Ferrari", 8),
    year(2016, "Daniel Ricciardo", "Red Bull", 4),
    year(2017, "Max Verstappen", "Red Bull", 3),
    year(2004, "Michael Schumacher", "Ferrari", 1),
    year(2010, "Sebastian Vettel", "Red Bull", 3),
  ];
  const ages = {
    youngestWinner: { driver: "Max Verstappen", age: 20, year: 2017 },
    oldestWinner: { driver: "Michael Schumacher", age: 35, year: 2004 },
    youngestPoleSitter: null,
    oldestPoleSitter: null,
  };
  const ctx = buildCircuitContext("Kuala Lumpur", "Sepang", "Malaysian Grand Prix", "Malaysia", 2026, null, null, timeline, ages);
  const text = formatCircuitContext(ctx);

  it("ranks the constructors, for \"which constructor has the best record here?\"", () => {
    assert.deepEqual(ctx.topTeams, [
      { team: "Red Bull", wins: 3 },
      { team: "Ferrari", wins: 2 },
    ]);
    assert.match(text, /top constructors: Red Bull \(3\), Ferrari \(2\)/);
  });

  it("lists every winner by year, newest first, for \"who won here in 2012?\"", () => {
    assert.equal(ctx.winnersByYear[0], "2017 Max Verstappen (Red Bull) from P3");
    assert.equal(ctx.winnersByYear.length, 5);
    assert.match(text, /WINNERS BY YEAR\n {2}2017 Max Verstappen/);
  });

  it("names the upsets, winners from P4 or lower, furthest back first", () => {
    assert.deepEqual(ctx.upsets, ["Fernando Alonso won from P8 in 2012", "Daniel Ricciardo won from P4 in 2016"]);
  });

  it("states the age records it was given, and leaves them out when it wasn't", () => {
    assert.match(text, /youngest winner: Max Verstappen, 20 \(2017\)/);
    assert.match(text, /oldest winner: Michael Schumacher, 35 \(2004\)/);
    const without = formatCircuitContext(buildCircuitContext("Kuala Lumpur", "Sepang", null, null, 2026, null, null, timeline));
    assert.doesNotMatch(without, /youngest winner/);
  });
});
