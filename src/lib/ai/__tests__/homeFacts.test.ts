// Ask Apex on the signed-in home page: it was sent only the AI briefing, prose that deliberately
// doesn't repeat the page's numbers, and the route sliced that to 6,000 characters mid-JSON.

import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { buildHomeApexFacts, fitHomeContext } from "../context/homeFacts";
import type { PersonalHomeData, PublicHomeData } from "@/lib/homeData";

const publicData = {
  year: 2026,
  nextRace: {
    id: "2026_r16_bahrain-grand-prix",
    year: 2026,
    round: 16,
    name: "Bahrain Grand Prix",
    circuit: "Kuala Lumpur",
    status: "upcoming",
    updatedAt: "",
    inputs: [
      { driver: "HAM", driverName: "Lewis Hamilton", team: "Ferrari", grid: 2, qualifyingGapSec: 0.298 },
      { driver: "NOR", driverName: "Lando Norris", team: "McLaren", grid: 1, qualifyingGapSec: 0 },
    ],
    simulation: {
      generatedAt: "",
      modelVersion: "",
      drivers: [
        { driver: "HAM", team: "Ferrari", medianPosition: 3, positionProbabilities: [], p1: 0.21, podium: 0.6, top5: 0.8 },
        { driver: "NOR", team: "McLaren", medianPosition: 1, positionProbabilities: [], p1: 0.44, podium: 0.81, top5: 0.9 },
      ],
    },
  },
  calendarEntry: { sessions: [{ label: "Qualifying", date: "2026-10-03T08:00:00" }] },
  seasonRecap: {
    roundsCompleted: 15,
    totalRounds: 23,
    driverLeader: { driver: "ANT", driverName: "Kimi Antonelli", team: "Mercedes", points: 276, wins: 8, podiums: 11 },
    driverGapToSecond: 74,
    teamLeader: { team: "Mercedes", points: 420, wins: 9, podiums: 18 },
    favoriteDriverRanks: [{ id: "hamilton", name: "Lewis Hamilton", code: "HAM", rank: 4, points: 180 }],
    favoriteTeamRanks: [],
  },
  facts: [{ icon: "trophy", text: "Kimi Antonelli leads the 2026 championship" }],
} as unknown as PublicHomeData;

const personalData = {
  myPick: { raceId: "2026_r16_bahrain-grand-prix", predictedWinner: "HAM", predictedPodium: ["HAM", "NOR", "ANT"], submittedAt: "" },
  predictionPerformance: { winner: { correct: 3, total: 11 }, podiumSlots: { correct: 14, total: 33 }, avgPositionError: null, recent: [] },
} as unknown as PersonalHomeData;

describe("buildHomeApexFacts", () => {
  it("carries the numbers the page shows: the model, the grid, your pick, your record, the standings, the schedule", () => {
    const facts = buildHomeApexFacts(publicData, personalData, "UTC");
    assert.equal(facts.nextRace, "Bahrain Grand Prix, round 16 of 23");
    assert.deepEqual(facts.modelChances, ["NOR win 44%, podium 81%", "HAM win 21%, podium 60%"]);
    assert.deepEqual(facts.grid, ["P1 NOR", "P2 HAM"]);
    assert.equal(facts.yourPick, "You picked HAM to win, with a podium of HAM, NOR, ANT.");
    assert.equal(facts.yourPredictionRecord, "Winner right 3 of 11; podium places right 14 of 33.");
    assert.deepEqual(facts.championship, ["Leader: Kimi Antonelli, 276 pts (74 clear)", "Leading team: Mercedes, 420 pts", "Your driver Lewis Hamilton: P4, 180 pts", "15 of 23 rounds run"]);
    assert.deepEqual(facts.schedule, ["Qualifying: Sat 3 Oct, 08:00 UTC"]);
    assert.deepEqual(facts.headlines, ["Kimi Antonelli leads the 2026 championship"]);
  });

  it("says so when there's no pick, rather than leaving Apex to guess", () => {
    assert.equal(buildHomeApexFacts(publicData, { ...personalData, myPick: null }).yourPick, "You haven't made a pick for the next race.");
  });
});

describe("fitHomeContext", () => {
  const facts = buildHomeApexFacts(publicData, personalData, "UTC");
  const long = "The championship turned at Zandvoort, where ".repeat(40);
  const context = {
    page: "home",
    facts,
    snapshot: { raceBrief: { headline: "Bahrain", whyItMatters: long }, seasonNarrative: long, predictionCoach: { tip: long } },
  };

  it("leaves a context that fits alone", () => {
    const small = { page: "home", facts, snapshot: { raceBrief: { headline: "Bahrain" } } };
    assert.equal(fitHomeContext(small, 6_000), small);
  });

  it("shortens the briefing's prose to fit, keeps every section, and never touches the facts", () => {
    const fitted = fitHomeContext(context, 5_800);
    assert.ok(JSON.stringify(fitted).length <= 5_800);
    assert.deepEqual(fitted.facts, facts);
    assert.deepEqual(Object.keys(fitted.snapshot as object), ["raceBrief", "seasonNarrative", "predictionCoach"]);
  });

  it("drops whole sections from the end when shortening isn't enough, and the JSON stays whole", () => {
    const fitted = fitHomeContext(context, JSON.stringify({ page: "home", facts }).length + 300);
    const json = JSON.stringify(fitted);
    assert.doesNotThrow(() => JSON.parse(json));
    assert.deepEqual(fitted.facts, facts);
    assert.ok(Object.keys(fitted.snapshot as object).length < 3);
  });
});
