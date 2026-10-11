// The circuit take's context and fallback: the state of a live weekend, the season/layout/lead-change extras, and
// fallback prose that reads like writing (no "win(s)", small numbers in words, only facts it was given).
import { test } from "node:test";
import assert from "node:assert/strict";
import { buildCircuitContext, formatCircuitContext } from "../ai/context/circuitContext";
import { generateCircuitTakeFallback } from "../ai/fallback";
import type { RaceSummary } from "../../app/season/_service/season.pure";
import type { CircuitYearRecord } from "../circuitIntelligence";

const race = (over: Partial<RaceSummary>): RaceSummary =>
  ({
    round: 17, name: "Singapore Grand Prix", trackShort: "MAR", raceDate: "2026-10-11", state: "upcoming", sessions: [], poleSitter: null, results: [], hasQualifying: false,
    circuit: "Marina Bay", country: "Singapore", eventFormat: null, isSprintWeekend: false, weekendStatus: "upcoming", photoUrls: [], circuitTrackMap: null, forecast: null,
    raceWeather: null, podium: [], winnerName: null, poleSitterName: null, fastestLap: null, predicted: null, ...over,
  }) as RaceSummary;
const year = (y: number, winner: string, grid: number): CircuitYearRecord => ({
  year: y, winnerDriver: winner, winnerTeam: "T", winnerGrid: grid, winnerCode: null, winnerArchiveDriverId: null, poleSitter: null, poleCode: null, poleArchiveDriverId: null,
  winnerWasPole: grid === 1, winningMarginSec: null, fieldMovementAvg: null, dryRace: null, avgTempC: null, raceName: null, raceDateIso: null, fastestLapSec: null, fastestLapDriver: null, fastestLapCode: null,
});
const timeline = [year(2025, "George Russell", 1), year(2024, "Lando Norris", 1), year(2015, "Sebastian Vettel", 1), year(2013, "Sebastian Vettel", 1), year(2008, "Fernando Alonso", 15)];
const form = { leaders: [{ name: "Kimi Antonelli", team: "Mercedes", points: 294, wins: 8 }, { name: "George Russell", team: "Mercedes", points: 202, wins: 3 }, { name: "Lewis Hamilton", team: "Ferrari", points: 194, wins: 1 }], recentWinners: ["Spanish Grand Prix: Kimi Antonelli"] };

test("a weekend under way is the next race, even before the calendar moves its pointer", () => {
  const ctx = buildCircuitContext("Marina Bay", "Marina Bay Street Circuit", "Singapore Grand Prix", "Singapore", 2026, null, race({ state: "upcoming", weekendStatus: "live" }), timeline, null, { form });
  assert.equal(ctx.state, "next");
  const text = formatCircuitContext(ctx);
  assert.match(text, /THIS SEASON'S FORM/);
  assert.match(text, /P1 Kimi Antonelli \(Mercedes\) 294 pts/);
  assert.ok(ctx.evidenceIds.includes("Kimi Antonelli"), "the leaders it's shown are citable");
});

test("form is only for a round still to come; lead changes only for one that has run", () => {
  const done = buildCircuitContext("Marina Bay", "Marina Bay", null, null, 2026, null, race({ state: "completed", weekendStatus: "completed", winnerName: "X" }), timeline, null, {
    form,
    leadChanges: { total: 2, onTrack: 1, inPits: 1, lines: ["from lap 1, A leads (passed B on track)"], lastPass: { lap: 1, by: "A", from: "B", near: null } },
    layouts: ["2008–2012", "2023–2025"],
  });
  assert.equal(done.form, null);
  assert.match(formatCircuitContext(done), /HOW THIS SEASON'S RACE HERE WAS WON/);
  assert.match(formatCircuitContext(done), /LAYOUT HISTORY \(the track has changed 1 times/);
  const next = buildCircuitContext("Marina Bay", "Marina Bay", null, null, 2026, null, race({ state: "next" }), timeline, null, { leadChanges: { total: 1, onTrack: 1, inPits: 0, lines: [], lastPass: null } });
  assert.equal(next.leadChanges, null);
});

test("the fallback reads as prose: numbers in words, the championship gap, never 'win(s)'", () => {
  const up = generateCircuitTakeFallback(buildCircuitContext("Marina Bay", "Marina Bay Street Circuit", null, null, 2026, null, race({ state: "next" }), timeline, null, { form }));
  assert.match(up.trackTake!.summary, /Sebastian Vettel has won here most, two times\./);
  assert.match(up.trackTake!.summary, /Kimi Antonelli arrives leading the championship by 92 points from George Russell\./);
  assert.doesNotMatch(up.trackTake!.summary, /\(s\)/);

  const done = generateCircuitTakeFallback(
    buildCircuitContext("Silverstone", "Silverstone Circuit", "British Grand Prix", "UK", 2026, null, race({ state: "completed", weekendStatus: "completed", winnerName: "Charles Leclerc", poleSitterName: "Kimi Antonelli" }), timeline, null, {
      leadChanges: { total: 3, onTrack: 1, inPits: 2, lines: [], lastPass: { lap: 1, by: "Charles Leclerc", from: "Kimi Antonelli", near: "between Turn 18 and Turn 1" } },
    }),
  );
  assert.equal(done.trackTake!.headline, "Charles Leclerc wins British Grand Prix");
  assert.match(done.trackTake!.summary, /The lead changed hands three times: one on track and two in the pit stops\./);
  assert.match(done.trackTake!.summary, /Charles Leclerc made the last pass for the lead on lap 1, past Kimi Antonelli, between Turn 18 and Turn 1\./);
});
