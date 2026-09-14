import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { generateTrackShape } from "../trackShape";
import { describeTrackCharacter, getCircuitFacts, type CircuitFacts } from "../circuitFacts";
import { buildCircuitContext, circuitValidIds } from "../ai/context/circuitContext";
import { validateSharedCircuitIntelligence } from "../ai/schemas/seasonIntelligence";
import type { RaceSummary } from "@/app/season/_service/season.pure";

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
