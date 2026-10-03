import { formatLapTime } from "@/lib/format";
import type { ArchiveRaceDoc } from "@/lib/supabase/archive";
import type { RaceDoc } from "@/lib/types/race";

/**
 * Everything the race page shows about this weekend's sessions, compact enough for Ask Apex's
 * context: practice, the qualifying grid, the full result once there is one, the model's
 * predictions and the weather.
 *
 * Without it Apex was told only which race it was and the circuit's history before the race, and
 * only the podium afterwards - so "how did Lewis do in practice and qualifying" got "I don't have
 * that" on a page showing all of it. One line per driver ("P3 HAM 1:32.410 +0.287") keeps a full
 * weekend to a few KB; `drivers` maps a first name or a team in the question to a code.
 */
export type RaceWeekendFacts = {
  /** "HAM Lewis Hamilton (Ferrari)", one per driver this weekend. */
  drivers: string[];
  /** Best laps per session, fastest first: "P1 NOR 1:32.123", "P2 PIA 1:32.300 +0.177". */
  practice?: Partial<Record<"FP1" | "FP2" | "FP3", string[]>>;
  /** The starting grid from qualifying: "P1 NOR", "P2 PIA +0.120s to pole". */
  qualifying?: { pole: string | null; grid: string[] };
  /** The race result, every car: "P1 VER from grid 3, 25 pts", "DNF ALB from grid 12". */
  result?: { source: string; classification: string[] };
  /** The app's own model: predicted finishing order, win/podium chances, predicted pole. */
  model?: { predictedFinish?: string[]; winAndPodiumChance?: string[]; predictedQualifying?: string[] };
  weather?: string;
};

const pct = (p: number) => `${Math.round(p * 100)}%`;

export function raceWeekendFacts(race: RaceDoc): RaceWeekendFacts | null {
  const names = new Map<string, string>();
  for (const entry of [...(race.inputs ?? []), ...(race.results ?? [])]) {
    if (!names.has(entry.driver)) names.set(entry.driver, `${entry.driver} ${entry.driverName} (${entry.team})`);
  }

  const facts: RaceWeekendFacts = { drivers: [] };

  const practice: NonNullable<RaceWeekendFacts["practice"]> = {};
  for (const session of ["FP1", "FP2", "FP3"] as const) {
    const laps = race.practice?.[session]?.bestLaps;
    if (!laps?.length) continue;
    practice[session] = [...laps]
      .sort((a, b) => a.lapTimeSec - b.lapTimeSec)
      .map((lap, i) => `P${i + 1} ${lap.driver} ${formatLapTime(lap.lapTimeSec)}${i > 0 ? ` +${lap.deltaToBestSec.toFixed(3)}` : ""}`);
    for (const lap of laps) if (!names.has(lap.driver)) names.set(lap.driver, lap.driver);
  }
  if (Object.keys(practice).length) facts.practice = practice;

  if (race.inputs?.length) {
    const pole = race.poleSitter ? `${race.poleSitter}${race.poleTimeSec ? ` ${formatLapTime(race.poleTimeSec)}` : ""}` : null;
    facts.qualifying = {
      pole,
      grid: [...race.inputs]
        .sort((a, b) => a.grid - b.grid)
        .map((entry) => `P${entry.grid} ${entry.driver}${entry.qualifyingGapSec ? ` +${entry.qualifyingGapSec.toFixed(3)}s to pole` : ""}`),
    };
  }

  if (race.results?.length) {
    facts.result = {
      source: race.resultsSource === "openf1_preliminary" ? "preliminary (official classification not yet published)" : "official",
      classification: [...race.results]
        .sort((a, b) => a.finishPosition - b.finishPosition)
        .map((entry) => {
          const place = entry.status === "dnf" ? "DNF" : `P${entry.finishPosition}`;
          const grid = entry.grid ? ` from grid ${entry.grid}` : "";
          return `${place} ${entry.driver}${grid}, ${entry.points} pts${entry.status === "lapped" ? " (lapped)" : ""}`;
        }),
    };
  }

  const model: NonNullable<RaceWeekendFacts["model"]> = {};
  if (race.prediction?.finishOrder?.length) {
    model.predictedFinish = [...race.prediction.finishOrder]
      .sort((a, b) => a.predictedPosition - b.predictedPosition)
      .slice(0, 10)
      .map((entry) => `${entry.predictedPosition}. ${entry.driver}`);
  }
  if (race.simulation?.drivers?.length) {
    model.winAndPodiumChance = [...race.simulation.drivers]
      .sort((a, b) => b.p1 - a.p1)
      .slice(0, 8)
      .map((entry) => `${entry.driver} win ${pct(entry.p1)}, podium ${pct(entry.podium)}`);
  }
  if (race.polePrediction?.order?.length) {
    model.predictedQualifying = [...race.polePrediction.order]
      .sort((a, b) => a.predictedQualiPosition - b.predictedQualiPosition)
      .slice(0, 5)
      .map((entry) => `${entry.predictedQualiPosition}. ${entry.driver}`);
  }
  if (Object.keys(model).length) facts.model = model;

  if (race.weather) {
    const w = race.weather;
    facts.weather = `air ${Math.round(w.airTempC)}°C, track ${Math.round(w.trackTempC)}°C, humidity ${Math.round(w.humidityPct)}%, ${w.rainfall ? "rain" : "dry"}`;
  }

  facts.drivers = [...names.values()].sort();
  return facts.practice || facts.qualifying || facts.result || facts.model ? facts : null;
}

/** An archive status that is a classified finish: "Finished" or "+N Lap(s)". */
const classified = (status: string) => status === "Finished" || /^\+\d+ Laps?$/.test(status);

/**
 * The same facts for an archive race (any finished season): the full classification and the
 * qualifying order. The archive context, like the live one, carried only the podium, so "where did
 * Hamilton finish" was unanswerable unless he was on it. Archive data has no practice sessions.
 */
export function archiveRaceFacts(race: ArchiveRaceDoc): RaceWeekendFacts | null {
  const code = (entry: { driverId: string; driverCode?: string | null }) => entry.driverCode ?? entry.driverId;
  const names = new Map<string, string>();
  for (const entry of race.results) names.set(code(entry), `${code(entry)} ${entry.driverName} (${entry.constructor})`);

  const facts: RaceWeekendFacts = { drivers: [...names.values()].sort() };
  const codeById = new Map(race.results.map((entry) => [entry.driverId, code(entry)]));

  if (race.qualifying?.length) {
    const order = [...race.qualifying].sort((a, b) => a.position - b.position);
    const best = (entry: (typeof order)[number]) => entry.q3 ?? entry.q2 ?? entry.q1;
    const pole = order[0];
    facts.qualifying = {
      pole: pole ? `${codeById.get(pole.driverId) ?? pole.driverId}${best(pole) ? ` ${best(pole)}` : ""}` : null,
      grid: order.map((entry) => `P${entry.position} ${codeById.get(entry.driverId) ?? entry.driverId}${best(entry) ? ` ${best(entry)}` : ""}`),
    };
  }

  if (race.results.length) {
    facts.result = {
      source: "official",
      classification: [...race.results]
        .sort((a, b) => a.position - b.position)
        .map((entry) => {
          const place = classified(entry.status) ? `P${entry.position}` : `DNF (${entry.status})`;
          const grid = entry.grid ? ` from grid ${entry.grid}` : entry.grid === 0 ? " from the pit lane" : "";
          return `${place} ${code(entry)}${grid}, ${entry.points} pts`;
        }),
    };
  }

  return facts.result || facts.qualifying ? facts : null;
}
