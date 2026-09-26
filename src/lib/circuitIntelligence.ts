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
  // Additive - both builders below already resolve the winner's own result row, so this is real
  // data already in hand, not a second fetch. Purely additional; every existing consumer that
  // destructures this type without reading winnerTeam is unaffected.
  winnerTeam: string | null;
  // Additive, same reasoning as winnerTeam above - both builders already resolve the winner's own
  // result row, this just keeps two more fields already in hand. Used by circuits.service.ts to
  // resolve a real profile photo/link for the Past Winners table - never displayed raw here (this
  // module stays dependency-free, see its own top comment).
  winnerGrid: number | null;
  /** The winner's 3-letter code - real for every live-schema (2018+) row, and for an archive row
   * only once enrich_archive_driver_media.py has backfilled that driver's code (older eras are a
   * real, honest gap, not a bug). */
  winnerCode: string | null;
  /** The winner's own archive_drivers id - set directly for an archive-sourced row (no lookup
   * needed), null for a live-sourced row (resolved from winnerCode by the caller instead, since
   * every current driver also has an archive_drivers row). */
  winnerArchiveDriverId: string | null;
  poleSitter: string | null;
  /** The pole-sitter's own raw 3-letter code - real for a live-schema row (2018+), null for an
   * archive row (which resolves straight to poleArchiveDriverId instead, needing no code at all).
   * Mirrors winnerCode's own reasoning: a caller resolving ages/ids for a live year needs this to
   * batch-resolve through getArchiveDriverIdsByCode, the same call winnerCode already supports. */
  poleCode: string | null;
  /** The pole-sitter's own archive_drivers id - set directly for an archive-sourced row (no
   * lookup needed, and no risk of the 3-letter-code collision getArchiveDriverIdsByCode's own
   * comment documents - "VER" alone doesn't say Verstappen or Vergne). Null for a live-sourced
   * row; resolved from poleCode by the caller instead, the same one-batched-lookup pattern
   * winnerArchiveDriverId already relies on. */
  poleArchiveDriverId: string | null;
  winnerWasPole: boolean | null;
  winningMarginSec: number | null;
  fieldMovementAvg: number | null; // mean |grid - finish| across the classified field
  dryRace: boolean | null;
  avgTempC: number | null;
  /** The Grand Prix name this exact year's race was run under - "Bahrain Grand Prix", "San Marino
   * Grand Prix". A physical circuit can host more than one distinct Grand Prix identity over its
   * history (Imola: San Marino GP, Italian GP, and Emilia Romagna GP all at the same venue) - this
   * is what lets a caller tell "this circuit's full history" and "this specific Grand Prix's own
   * history" apart instead of silently crediting one event's record to a different one that just
   * happens to share a track. */
  raceName: string | null;
  /** This year's own real race date (ISO) - what an age-on-race-day calculation (youngest/oldest
   * winner or pole-sitter) needs; a birth year and a race year alone are off by up to a full year
   * either way. */
  raceDateIso: string | null;
  /** The actual fastest lap SET DURING THIS RACE - deliberately not the pole/qualifying time,
   * which is a different thing recorded in a different session (see this module's own record-
   * definition rule: never label one as the other). Null wherever the underlying per-lap
   * fastest-lap data doesn't exist for that year (an archive year enrich_archive_entities.py
   * hasn't reached, or - rare - a live year with no recorded fastest lap). */
  fastestLapSec: number | null;
  fastestLapDriver: string | null;
  fastestLapCode: string | null;
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
  // RaceResultEntry already carries each driver's own fastestLapSec (see toResultRow's own
  // comment in SeasonRaceDashboard.tsx) - the real minimum across the classified field, not the
  // pole/qualifying time, which lives on a different field (race.poleTimeSec) entirely.
  const fastestLapRow = results.reduce<(typeof results)[number] | null>((best, r) => {
    if (r.fastestLapSec === null) return best;
    if (!best || best.fastestLapSec === null || r.fastestLapSec < best.fastestLapSec) return r;
    return best;
  }, null);
  return {
    year: race.year,
    winnerDriver: winner?.driverName ?? null,
    winnerTeam: winner?.team ?? null,
    winnerGrid: winner?.grid ?? null,
    winnerCode: winner?.driver ?? null,
    winnerArchiveDriverId: null,
    poleSitter: poleSitterName,
    poleCode: race.poleSitter ?? null,
    poleArchiveDriverId: null,
    winnerWasPole: winner && race.poleSitter ? winner.driver === race.poleSitter : null,
    // finishGapSec is P2's own real field - already a clean number, no string parsing needed.
    winningMarginSec: runnerUp?.finishGapSec ?? null,
    fieldMovementAvg: average(classified.map((r) => Math.abs(r.grid! - r.finishPosition))),
    dryRace: race.weather ? !race.weather.rainfall : null,
    avgTempC: race.weather?.airTempC ?? null,
    raceName: race.name,
    raceDateIso: race.raceDate ?? null,
    fastestLapSec: fastestLapRow?.fastestLapSec ?? null,
    fastestLapDriver: fastestLapRow?.driverName ?? null,
    fastestLapCode: fastestLapRow?.driver ?? null,
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
  // `rank === 1` on the per-driver fastestLap block is FastF1/Ergast's own "this was the actual
  // fastest lap of the race" marker - authoritative, not re-derived by parsing every driver's own
  // lap-time string and comparing (their `time` fields aren't guaranteed comparable strings across
  // eras the way parseTimeToSeconds's own docstring already warns about for finish gaps).
  const fastestLapRow = results.find((r) => r.fastestLap?.rank === 1) ?? null;
  const fastestLapSec = fastestLapRow?.fastestLap ? parseTimeToSeconds(fastestLapRow.fastestLap.time) : null;
  return {
    year: race.year,
    winnerDriver: winner?.driverName ?? null,
    winnerTeam: winner?.constructor ?? null,
    winnerGrid: winner?.grid ?? null,
    winnerCode: winner?.driverCode ?? null,
    winnerArchiveDriverId: winner?.driverId ?? null,
    poleSitter: poleSitter?.driverName ?? null,
    poleCode: null,
    poleArchiveDriverId: poleSitter?.driverId ?? null,
    winnerWasPole: winner && poleSitter ? winner.driverId === poleSitter.driverId : null,
    winningMarginSec: margin,
    fieldMovementAvg: average(classified.map((r) => Math.abs(r.grid! - r.position))),
    dryRace: race.weather ? race.weather.precipitationMm <= 0 : null,
    avgTempC: race.weather ? (race.weather.tempMaxC + race.weather.tempMinC) / 2 : null,
    raceName: race.raceName,
    raceDateIso: race.raceDate,
    fastestLapSec,
    fastestLapDriver: fastestLapRow?.driverName ?? null,
    fastestLapCode: fastestLapRow?.driverCode ?? null,
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

/** Natural-language join for a (usually one-name, occasionally tied) record holder list - "Max
 * Verstappen", "Max Verstappen and Lewis Hamilton", "Max Verstappen, Lewis Hamilton and Sebastian
 * Vettel". Every caller that used to read a single `.driver` off a record now reads `.drivers`
 * (plural) instead - this is the one place that turns that array back into a sentence. */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names[0] ?? "";
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export type TrackRecords = {
  // `drivers` (plural, always at least one) rather than a single name - "Historical records with
  // tied results" is a real case at this sample size (a handful of runnings, easily sharing a
  // leader), and picking just one of several tied leaders would state a false sole record holder.
  mostWins: { drivers: string[]; count: number } | null;
  mostPoles: { drivers: string[]; count: number } | null;
  closestMargin: { year: number; sec: number } | null;
  largestMargin: { year: number; sec: number } | null;
};

export function computeTrackRecords(timeline: CircuitYearRecord[]): TrackRecords {
  const margins = timeline.filter((r): r is CircuitYearRecord & { winningMarginSec: number } => r.winningMarginSec !== null);
  const closest = margins.length ? margins.reduce((a, b) => (b.winningMarginSec < a.winningMarginSec ? b : a)) : null;
  const largest = margins.length ? margins.reduce((a, b) => (b.winningMarginSec > a.winningMarginSec ? b : a)) : null;
  const wins = topByCountAll(timeline.map((r) => r.winnerDriver));
  const poles = topByCountAll(timeline.map((r) => r.poleSitter));
  return {
    mostWins: wins ? { drivers: wins.names, count: wins.count } : null,
    mostPoles: poles ? { drivers: poles.names, count: poles.count } : null,
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

/** The same ranked win count as computeTopWinners, by constructor instead of driver - real team
 * names as recorded per year (`winnerTeam`), so a team that's been through a rebrand across this
 * timeline's own span (a real, not-uncommon case) counts each era's own name separately rather
 * than silently merging them under an identity this data has no record of equating. */
export function computeTopWinningTeams(timeline: CircuitYearRecord[], limit = 5): { team: string; wins: number }[] {
  const counts = new Map<string, number>();
  for (const r of timeline) {
    if (!r.winnerTeam) continue;
    counts.set(r.winnerTeam, (counts.get(r.winnerTeam) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([team, wins]) => ({ team, wins }))
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

/** The circuit's own lap record - the fastest lap ever actually driven in a RACE at this venue,
 * never the pole/qualifying time (a different session, a different number, and conflating the two
 * is exactly the mislabeling this module's own record definitions have to avoid). Null wherever no
 * year in the window has fastest-lap data at all. */
export function computeLapRecord(timeline: CircuitYearRecord[]): { driver: string; sec: number; year: number } | null {
  const withLap = timeline.filter((r): r is CircuitYearRecord & { fastestLapSec: number; fastestLapDriver: string } => r.fastestLapSec !== null && r.fastestLapDriver !== null);
  if (withLap.length === 0) return null;
  const fastest = withLap.reduce((a, b) => (b.fastestLapSec < a.fastestLapSec ? b : a));
  return { driver: fastest.fastestLapDriver, sec: fastest.fastestLapSec, year: fastest.year };
}

/** Every distinct Grand Prix identity this circuit's timeline has ever run under, most recent
 * first - "Bahrain Grand Prix" the whole time for a single-identity venue, but "San Marino Grand
 * Prix" / "Italian Grand Prix" / "Emilia Romagna Grand Prix" all at Imola. A caller uses this to
 * decide whether "this Grand Prix's own history" and "this circuit's full history" are even two
 * different things worth showing separately, or the same one. */
export function distinctRaceNames(timeline: CircuitYearRecord[]): string[] {
  const seen = new Set<string>();
  for (const r of timeline) if (r.raceName) seen.add(r.raceName);
  return [...seen];
}

/** The subset of a circuit's timeline run under one specific Grand Prix name - what "Grand Prix
 * History" (as opposed to "Circuit History") actually means: never crediting one event's record
 * to a different one that happened to share the same physical track. A year with no recorded race
 * name (a genuine gap in older data) is excluded rather than guessed into either bucket. */
export function filterByRaceName(timeline: CircuitYearRecord[], raceName: string): CircuitYearRecord[] {
  return timeline.filter((r) => r.raceName === raceName);
}

/** Every driver tied for the lead, not just whichever the map iteration happened to see first -
 * "Historical records with tied results" is a real, not rare, case at this sample size (a handful
 * of runnings each sharing one winner), and silently picking one implies a false sole record
 * holder. */
export function topByCountAll(values: (string | null)[]): { names: string[]; count: number } | null {
  const counts = new Map<string, number>();
  for (const v of values) {
    if (!v) continue;
    counts.set(v, (counts.get(v) ?? 0) + 1);
  }
  if (counts.size === 0) return null;
  const max = Math.max(...counts.values());
  return { names: [...counts.entries()].filter(([, c]) => c === max).map(([name]) => name), count: max };
}

/** Podium count (not just wins) per driver across a raw set of races - built straight from the
 * same two real sources buildCircuitTimeline merges, not from CircuitYearRecord (which only ever
 * keeps the WINNER per year - a podium leaderboard needs every classified top-3 finisher, so this
 * reads the full results list itself). Deduped by year+driver the same way buildCircuitTimeline
 * dedupes by year alone - archive_races and the live `races` schema both cover 2018+, and without
 * this a driver's own overlapping years would be double-counted once as an archive podium and
 * again as a live one. */
export function computeMostPodiums(liveRaces: RaceDoc[], archiveRaces: ArchiveRaceDoc[], limit = 5): { driver: string; podiums: number }[] {
  const seenYears = new Set<number>();
  const counts = new Map<string, number>();
  const countRace = (year: number, podiumDrivers: string[]) => {
    if (seenYears.has(year)) return;
    seenYears.add(year);
    for (const name of podiumDrivers) counts.set(name, (counts.get(name) ?? 0) + 1);
  };
  // Live first - archive_races is not "pre-2018 only" (see buildCircuitTimeline's own comment), so
  // whichever source is checked second must be the one that's SKIPPED on a year collision, and
  // live is this app's own "the current thing that's actually happening" source of truth.
  for (const race of liveRaces) {
    if (race.status !== "completed" || !race.results?.length) continue;
    countRace(
      race.year,
      race.results.filter((r) => r.finishPosition <= 3).map((r) => r.driverName),
    );
  }
  for (const race of archiveRaces) {
    if (!race.results?.length) continue;
    countRace(
      race.year,
      race.results.filter((r) => r.position <= 3).map((r) => r.driverName),
    );
  }
  return [...counts.entries()]
    .map(([driver, podiums]) => ({ driver, podiums }))
    .sort((a, b) => b.podiums - a.podiums)
    .slice(0, limit);
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
