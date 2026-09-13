import { parseTimeToSeconds } from "@/lib/parseTimeToSeconds";
import type { ArchiveRaceDoc } from "@/lib/supabase/archive";
import type { RaceDoc } from "@/lib/types/race";

// A pure, dependency-free module on purpose - the Track Intelligence panel that consumes this is a
// client component (its historical filter is real interactive state), and a sibling bug this
// session already hit once (sessionCode, extracted to its own file for the exact same reason) shows
// what happens otherwise: any file a client component imports that transitively pulls in
// server-only Supabase admin code (season.service.ts, archive.ts's own module-scope client) crashes
// the browser the instant that module evaluates. Nothing here imports either.

/** One track's one calendar year, normalized from whichever of the two real sources actually
 * covers it - archive_races (pre-2018 through however far the archive reaches) or the live `races`
 * schema (2018+). Every field is null, not fabricated, wherever that year's real data doesn't
 * support it (a runner-up who was lapped has no clean winning-margin number; a year `races` never
 * recorded weather for has no dry/temp reading) - the stat functions below all skip nulls rather
 * than let one gap distort an average. */
export type CircuitYearRecord = {
  year: number;
  winnerDriver: string | null;
  poleSitter: string | null;
  winnerWasPole: boolean | null;
  winningMarginSec: number | null;
  fieldMovementAvg: number | null; // mean |grid - finish| across the classified field
  dryRace: boolean | null;
  avgTempC: number | null;
};

function average(values: number[]): number | null {
  return values.length ? values.reduce((sum, v) => sum + v, 0) / values.length : null;
}

// Mirrors season.service.ts's own archiveFinishStatus (same three-way Ergast status read) -
// duplicated, not imported, since that file's own module graph reaches server-only Supabase admin
// code (see this file's own top comment for why that matters here specifically).
function archiveIsClassified(status: string): boolean {
  return status === "Finished" || /^\+\d+ Lap/.test(status);
}

function fromLiveRace(race: RaceDoc): CircuitYearRecord | null {
  if (race.status !== "completed" || !race.results?.length) return null;
  const results = race.results;
  const winner = results.find((r) => r.finishPosition === 1) ?? null;
  const runnerUp = results.find((r) => r.finishPosition === 2) ?? null;
  const classified = results.filter((r) => r.status !== "dnf" && r.grid !== null);
  // race.poleSitter is a raw 3-letter code, not a display name (see RaceDoc's own type) - resolved
  // against this race's own results the same way SeasonRaceDashboard's highlights already do,
  // falling back to the bare code only if that driver genuinely isn't in results for some reason.
  const poleSitterName = race.poleSitter ? (results.find((r) => r.driver === race.poleSitter)?.driverName ?? race.poleSitter) : null;
  return {
    year: race.year,
    winnerDriver: winner?.driverName ?? null,
    poleSitter: poleSitterName,
    winnerWasPole: winner && race.poleSitter ? winner.driver === race.poleSitter : null,
    // finishGapSec is P2's own real field - already a clean number, no string parsing needed.
    winningMarginSec: runnerUp?.finishGapSec ?? null,
    fieldMovementAvg: average(classified.map((r) => Math.abs(r.grid! - r.finishPosition))),
    dryRace: race.weather ? !race.weather.rainfall : null,
    avgTempC: race.weather?.airTempC ?? null,
  };
}

function fromArchiveRace(race: ArchiveRaceDoc): CircuitYearRecord | null {
  if (!race.results?.length) return null;
  const results = race.results;
  const winner = results.find((r) => r.position === 1) ?? null;
  const runnerUp = results.find((r) => r.position === 2) ?? null;
  const poleSitter = results.find((r) => r.grid === 1) ?? null;
  const classified = results.filter((r) => archiveIsClassified(r.status) && r.grid !== null);
  // parseTimeToSeconds on a result's own `time` field is exactly what its own docstring warns
  // against for anyone but the immediate runner-up ("+2 Laps" isn't seconds) - restricted to P2
  // here, and even then only kept when it actually parses (P2 lapped is real and not rare pre-2000s
  // F1), never coerced into a number that isn't one.
  const margin = runnerUp ? parseTimeToSeconds(runnerUp.time) : null;
  return {
    year: race.year,
    winnerDriver: winner?.driverName ?? null,
    poleSitter: poleSitter?.driverName ?? null,
    winnerWasPole: winner && poleSitter ? winner.driverId === poleSitter.driverId : null,
    winningMarginSec: margin,
    fieldMovementAvg: average(classified.map((r) => Math.abs(r.grid! - r.position))),
    dryRace: race.weather ? race.weather.precipitationMm <= 0 : null,
    avgTempC: race.weather ? (race.weather.tempMaxC + race.weather.tempMinC) / 2 : null,
  };
}

/** Both real sources for this exact physical track, merged into one per-year timeline. Confirmed
 * live (not assumed) that `archive_races` is NOT a "pre-2018 only" table - it comprehensively
 * covers a circuit's full history including years the live `races` schema also has (Monza: 75
 * archive rows, 1950-2025, fully overlapping `races`' own 2018-2025 rows for the same track) - a
 * plain concatenation double-counted every one of those overlapping years. Deduped by year instead:
 * archive first, then live entries for the same year *replace* the archive one - live is this app's
 * own "the current thing that's actually happening" source of truth (same reasoning seasonStatus's
 * ongoing/completed split already uses), so it wins for whichever year is still the live season,
 * and for any older year the two sources should agree on the same real facts anyway.
 *
 * Keyed by year, not year+round - a circuit hosting two races in one calendar year (a handful of
 * COVID-era double headers) is rare enough, and "two entries for one year" would only double-weight
 * that one season in the win/pole counts below, not create a wrong fact - an acceptable trade for
 * the much more common, much worse bug (every normal year double-counted) this fixes. */
export function buildCircuitTimeline(liveRaces: RaceDoc[], archiveRaces: ArchiveRaceDoc[]): CircuitYearRecord[] {
  const byYear = new Map<number, CircuitYearRecord>();
  for (const race of archiveRaces) {
    const record = fromArchiveRace(race);
    if (record) byYear.set(record.year, record);
  }
  for (const race of liveRaces) {
    const record = fromLiveRace(race);
    if (record) byYear.set(record.year, record);
  }
  return [...byYear.values()].sort((a, b) => b.year - a.year);
}

export type WindowYears = 1 | 5 | 10 | null; // null = all history

export function windowedTimeline(timeline: CircuitYearRecord[], window: WindowYears): CircuitYearRecord[] {
  if (window === null) return timeline;
  return timeline.slice(0, window);
}

export type TrackRecords = {
  mostWins: { driver: string; count: number } | null;
  mostPoles: { driver: string; count: number } | null;
  closestMargin: { year: number; sec: number } | null;
  largestMargin: { year: number; sec: number } | null;
};

function topByCount(values: (string | null)[]): { driver: string; count: number } | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  let best: { driver: string; count: number } | null = null;
  for (const [driver, count] of counts) {
    if (!best || count > best.count) best = { driver, count };
  }
  return best;
}

export function computeTrackRecords(timeline: CircuitYearRecord[]): TrackRecords {
  const margins = timeline.filter((r): r is CircuitYearRecord & { winningMarginSec: number } => r.winningMarginSec !== null);
  const closest = margins.length ? margins.reduce((a, b) => (b.winningMarginSec < a.winningMarginSec ? b : a)) : null;
  const largest = margins.length ? margins.reduce((a, b) => (b.winningMarginSec > a.winningMarginSec ? b : a)) : null;
  return {
    mostWins: topByCount(timeline.map((r) => r.winnerDriver)),
    mostPoles: topByCount(timeline.map((r) => r.poleSitter)),
    closestMargin: closest ? { year: closest.year, sec: closest.winningMarginSec } : null,
    largestMargin: largest ? { year: largest.year, sec: largest.winningMarginSec } : null,
  };
}

/** Top N drivers by win count at this circuit, for the ranked-bar list - same shape SimulationPanel's
 * own ProbabilityBars already renders (rank, name, proportional bar, real number), reused for visual
 * consistency rather than inventing a second bar-list treatment. */
export function computeTopWinners(timeline: CircuitYearRecord[], limit = 5): { driver: string; wins: number }[] {
  const counts = new Map<string, number>();
  for (const r of timeline) {
    if (!r.winnerDriver) continue;
    counts.set(r.winnerDriver, (counts.get(r.winnerDriver) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([driver, wins]) => ({ driver, wins }))
    .sort((a, b) => b.wins - a.wins)
    .slice(0, limit);
}

export type RaceTrends = {
  poleToWinPct: number | null;
  avgWinningMarginSec: number | null;
  avgFieldMovement: number | null;
};

export function computeRaceTrends(timeline: CircuitYearRecord[]): RaceTrends {
  const withPoleKnowledge = timeline.filter((r) => r.winnerWasPole !== null);
  const poleToWinPct = withPoleKnowledge.length ? (withPoleKnowledge.filter((r) => r.winnerWasPole).length / withPoleKnowledge.length) * 100 : null;
  return {
    poleToWinPct,
    avgWinningMarginSec: average(timeline.map((r) => r.winningMarginSec).filter((v): v is number => v !== null)),
    avgFieldMovement: average(timeline.map((r) => r.fieldMovementAvg).filter((v): v is number => v !== null)),
  };
}

export type WeatherHistory = { dryPct: number | null; avgTempC: number | null; sampleSize: number };

export function computeWeatherHistory(timeline: CircuitYearRecord[]): WeatherHistory {
  const withWeather = timeline.filter((r) => r.dryRace !== null);
  const dryPct = withWeather.length ? (withWeather.filter((r) => r.dryRace).length / withWeather.length) * 100 : null;
  return {
    dryPct,
    avgTempC: average(timeline.map((r) => r.avgTempC).filter((v): v is number => v !== null)),
    sampleSize: withWeather.length,
  };
}
