import { test } from "node:test";
import assert from "node:assert/strict";
import type { RaceSummary } from "../../app/season/_service/season.pure";
import type { CircuitLayout } from "../circuitLayout";
import { eraStory, roundStory } from "../circuitStory";
import type { RaceTrackStory } from "../raceTrackStory";

const result = (driver: string, driverName: string, finishPosition: number, grid: number) => ({ driver, driverName, team: "T", finishPosition, points: 0, grid, status: "finished" as const });
function race(over: Partial<RaceSummary> = {}): RaceSummary {
  return {
    round: 9, name: "British Grand Prix", trackShort: "SIL", raceDate: "2026-07-05", state: "completed", sessions: [], poleSitter: "ANT", results: [result("LEC", "Charles Leclerc", 1, 3), result("ANT", "Kimi Antonelli", 2, 1)],
    hasQualifying: true, circuit: "Silverstone", country: "UK", eventFormat: null, isSprintWeekend: false, weekendStatus: "completed", photoUrls: [], circuitTrackMap: null, forecast: null, raceWeather: null,
    podium: [], winnerName: "Charles Leclerc", poleSitterName: "Kimi Antonelli", fastestLap: { driver: "LEC", driverName: "Charles Leclerc", lapTimeSec: 87.512 }, predicted: null, ...over,
  } as RaceSummary;
}
const story = (changes: RaceTrackStory["leadChanges"]): RaceTrackStory => ({ version: 1, lapLengthM: 5891, outline: [], startFinish: { x: 0, y: 0, verified: true }, rotation: null, corners: [], leadChanges: changes });

test("a completed round: winner and start, lead changes, the decisive pass, the fastest lap", () => {
  const s = roundStory(race(), story([
    { lap: 1, from: "ANT", to: "LEC", kind: "pass", x: 0, y: 0, alongM: 200, precision: "verified", uncertaintyM: 5, near: "between Turn 18 and Turn 1", battle: false, recordedLaterS: 1 },
    { lap: 26, from: "LEC", to: "ANT", kind: "pit" },
  ]), null, null);
  assert.equal(s.headline, "Charles Leclerc won British Grand Prix from P3.");
  assert.deepEqual(s.lines, [
    "The lead changed hands 2 times: 1 pass on track, 1 pit-stop change.",
    "The last lead change on track: Charles Leclerc passed Kimi Antonelli on lap 1, between Turn 18 and Turn 1.",
    "Fastest lap: Charles Leclerc, 87.512s.",
  ]);
});

test("no turn is named for an approximate pass, and no story means no invented lead-change line", () => {
  const approx = roundStory(race(), story([{ lap: 5, from: "ANT", to: "LEC", kind: "pass", x: 0, y: 0, alongM: 900, precision: "approximate", uncertaintyM: 60, near: null, battle: false, recordedLaterS: 1 }]), null, null);
  assert.ok(approx.lines.some((l) => l.endsWith("on lap 5.")), approx.lines.join(" | "));
  const none = roundStory(race({ fastestLap: null }), null, null, null);
  assert.deepEqual(none.lines, []);
  assert.equal(roundStory(race({ results: [result("LEC", "Charles Leclerc", 1, 1)], fastestLap: null }), story([]), null, null).headline, "Charles Leclerc won British Grand Prix from pole.");
  assert.deepEqual(roundStory(race({ fastestLap: null }), story([]), null, null).lines, ["Lights to flag, the lead never changed hands."]);
});

test("an upcoming or cancelled round", () => {
  const up = roundStory(race({ state: "upcoming", results: [], forecast: { airTempC: 18.4, rainProbability: 0.3, source: "openweathermap" } as never }), null, { lengthKm: 5.891, turns: 18, trackType: "permanent", lapRecord: { timeSec: 85.093, driverName: "Max Verstappen", year: 2020 } } as never, 12);
  assert.equal(up.headline, "British Grand Prix, round 9. In 12 days.");
  assert.deepEqual(up.lines, ["5.891 km, 18 turns.", "The lap record: 85.093s by Max Verstappen, 2020.", "18°C expected, 30% chance of rain."]);
  assert.equal(roundStory(race({ weekendStatus: "cancelled" }), null, null, null).headline, "British Grand Prix was cancelled.");
});

const layout = (id: string, seasons: number[], source: "drawn" | "measured", raceNameMatch: string | null = null): CircuitLayout =>
  source === "drawn"
    ? { layoutId: id, source, seasons, raceNameMatch, path: "M0 0", viewBox: "0 0 1 1", attribution: null }
    : { layoutId: id, source, seasons, raceNameMatch, outline: [], lapLengthM: 1, startFinish: { x: 0, y: 0 }, rotation: null, corners: [], attribution: null };

test("an era in words: a change from the previous layout, the source, and who won in it", () => {
  const old = layout("a", [2018, 2019, 2020, 2021, 2022], "measured");
  const now = layout("b", [2023, 2024, 2025], "measured");
  const e = eraStory(now, old, [{ year: 2023, winner: "Max Verstappen" }, { year: 2024, winner: "Max Verstappen" }, { year: 2025, winner: "Lando Norris" }, { year: 2022, winner: "Sergio Perez" }]);
  assert.equal(e.title, "2023–2025");
  assert.deepEqual(e.lines, ["A new layout from 2023: the track changed from the 2018–2022 one.", "Traced from F1's own car-position data.", "3 races won here in this era, Max Verstappen taking 2 of them."]);
  assert.equal(eraStory(layout("c", [1950, 1951], "drawn"), null, []).lines[0], "The earliest layout on record, 1950–1951.");
  assert.equal(eraStory(layout("d", [2020], "drawn", "sakhir"), old, []).title, "2020: the Sakhir layout");
  assert.ok(!eraStory(layout("d", [2020], "drawn", "sakhir"), old, []).lines.some((l) => l.startsWith("A new layout")), "a one-off variant is not 'a new layout'");
});
