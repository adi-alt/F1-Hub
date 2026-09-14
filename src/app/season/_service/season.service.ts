import { findArchiveCircuitByLocation, getAllArchiveCircuits, getArchiveDriverIdsByCode, getArchiveDriverPhotosByIds, getArchiveSeason } from "@/lib/supabase/archive";
import { getCalendarEntriesByYear } from "@/lib/supabase/calendar";
import { getAllCurrentDrivers, getAllCurrentTeams } from "@/lib/supabase/media";
import { getRacesByYear } from "@/lib/supabase/races";
import { getUserProfile } from "@/lib/supabase/users";
import { parseUtcDateTime } from "@/lib/countdown";
import { formatLapTime, trackShortForm } from "@/lib/format";
import { computeChampionshipProgression } from "@/lib/personalization";
import { sessionCode } from "@/lib/sessionCode";
import { computeStandings } from "@/lib/standings";
import { archiveSlugForCurrentTeam, teamSlug } from "@/lib/teamSlug";
import { buildBattles, buildRecords, completedRoundCount } from "./season.pure";
import type { CalendarEntry } from "@/lib/supabase/calendar";
import type { ArchiveCircuit, ArchiveRaceDoc } from "@/lib/supabase/archive";
import type { RaceDoc } from "@/lib/types/race";
import type { DriverStandingRow, ConstructorStandingRow, RaceResultSummary, RacePodiumEntry, RacePredictionSummary, RaceSummary, RaceWeekendStatus } from "./season.pure";

// Every type and pure deterministic computation (buildBattles, buildRecords, computeHeadToHead,
// computeRecentForm, computeStreaks, computePositionChanges) lives in season.pure.ts instead of
// here - that file has zero supabaseAdmin/getUserProfile imports, so client components (which
// pull in SeasonDetail.tsx as a "use client" module) can import the pure functions directly
// without dragging server-only code into the browser bundle. Re-exported here so every existing
// server-side caller (and the test file) can keep importing from "./season.service" unchanged.
export * from "./season.pure";

/** A calendar row's own status column is free-form text. Only the four values that carry real
 * meaning for the UI are honoured; anything else falls through to the derived state below, rather
 * than being displayed verbatim as if it were a known lifecycle state. */
function calendarWeekendStatus(status: string | null): RaceWeekendStatus | null {
  if (status === "cancelled" || status === "postponed") return status;
  return null;
}

function sessionResultFor(code: string, race: RaceDoc | undefined, winnerName: string | null): { label: string; value: string } | null {
  if (!race) return null;
  if (code === "R") return winnerName ? { label: "Winner", value: winnerName } : null;
  if (code === "Q") {
    const poleName = race.results?.find((r) => r.driver === race.poleSitter)?.driverName ?? race.poleSitter;
    return poleName ? { label: "Pole", value: poleName } : null;
  }
  // FP1/FP2/FP3 - real fastest-lap data from the pipeline's own practice documents. Sprint
  // sessions genuinely have no stored classification, so they correctly return null here.
  if (/^P\d$/.test(code)) {
    const key = `FP${code.slice(1)}` as "FP1" | "FP2" | "FP3";
    const best = race.practice?.[key]?.bestLaps?.[0];
    if (!best) return null;
    const name = race.results?.find((r) => r.driver === best.driver)?.driverName ?? best.driver;
    return { label: "Fastest", value: `${name} \u00b7 ${formatLapTime(best.lapTimeSec)}` };
  }
  return null;
}

function buildRaceSummaries(races: RaceDoc[], calendarEntries: CalendarEntry[], circuits: ArchiveCircuit[]): RaceSummary[] {
  const raceByRound = new Map(races.map((r) => [r.round, r]));
  const sorted = [...calendarEntries].sort((a, b) => a.round - b.round);

  const now = Date.now();
  // The pipeline writes naive datetime strings (no timezone suffix) - parseUtcDateTime treats
  // them as UTC instead of letting new Date() misparse them as local time in whatever timezone
  // this happens to run in (the exact bug already fixed for RaceHero/RaceWeekendPanel/PickPanel).
  const nextRound = sorted.find((e) => e.raceDate && parseUtcDateTime(e.raceDate).getTime() > now)?.round;

  // The single "what's happening next" pointer, but at session granularity instead of race
  // granularity — every session across the whole season, chronologically, so each weekend's
  // sessions can be marked completed/current/upcoming individually instead of the whole weekend
  // switching state at once.
  const allSessions = sorted
    .flatMap((e) => e.sessions.map((s) => ({ ...s, round: e.round })))
    .sort((a, b) => parseUtcDateTime(a.date).getTime() - parseUtcDateTime(b.date).getTime());
  const currentSession = allSessions.find((s) => parseUtcDateTime(s.date).getTime() > now);

  return sorted.map((entry) => {
    const race = raceByRound.get(entry.round);
    const completed = race?.status === "completed" && !!race.results?.length;
    const results = completed ? race?.results ?? [] : [];
    const winner = results.find((r) => r.finishPosition === 1) ?? null;

    // "The weekend has physically started" = its earliest session time has passed. Derived from
    // the same parseUtcDateTime the rest of this function uses, never from a second date parse.
    const sessionTimes = entry.sessions.map((sx) => parseUtcDateTime(sx.date).getTime());
    const weekendStart = sessionTimes.length > 0 ? Math.min(...sessionTimes) : entry.raceDate ? parseUtcDateTime(entry.raceDate).getTime() : null;
    const derivedStatus: RaceWeekendStatus = completed ? "completed" : weekendStart != null && weekendStart <= now ? "live" : "upcoming";

    // The model's own frozen pre-race prediction, for the post-race review. Simulation is
    // preferred over the ranking model when both exist - it's the one that carries real
    // probabilities (see RaceDoc's own notes on the two).
    let predicted: RacePredictionSummary | null = null;
    const simOrder = race?.simulation?.drivers ? [...race.simulation.drivers].sort((a, b) => a.medianPosition - b.medianPosition) : null;
    const modelOrder = race?.prediction?.finishOrder ? [...race.prediction.finishOrder].sort((a, b) => a.predictedPosition - b.predictedPosition) : null;
    const predictedPole = race?.polePrediction?.order?.find((o) => o.predictedQualiPosition === 1)?.driver ?? null;
    if (simOrder && simOrder.length > 0) {
      predicted = { winner: simOrder[0]?.driver ?? null, podium: simOrder.slice(0, 3).map((d) => d.driver), pole: predictedPole, source: "simulation" };
    } else if (modelOrder && modelOrder.length > 0) {
      predicted = { winner: modelOrder[0]?.driver ?? null, podium: modelOrder.slice(0, 3).map((d) => d.driver), pole: predictedPole, source: "model" };
    } else if (predictedPole) {
      predicted = { winner: null, podium: [], pole: predictedPole, source: "model" };
    }

    const fastest = results.reduce<{ driver: string; driverName: string; lapTimeSec: number } | null>((best, r) => {
      if (r.fastestLapSec == null) return best;
      if (!best || r.fastestLapSec < best.lapTimeSec) return { driver: r.driver, driverName: r.driverName, lapTimeSec: r.fastestLapSec };
      return best;
    }, null);

    const podium: RacePodiumEntry[] = results
      .filter((r) => r.finishPosition <= 3)
      .sort((a, b) => a.finishPosition - b.finishPosition)
      .map((r) => ({ position: r.finishPosition, driver: r.driver, driverName: r.driverName, team: r.team }));

    const isSprintWeekend = (entry.eventFormat ?? "").toLowerCase().includes("sprint") || entry.sessions.some((sx) => sx.label.toLowerCase().includes("sprint"));

    return {
      round: entry.round,
      name: entry.name ?? `Round ${entry.round}`,
      trackShort: trackShortForm(race?.circuit ?? entry.circuit ?? entry.name ?? `R${entry.round}`),
      raceDate: entry.raceDate,
      state: completed ? "completed" : entry.round === nextRound ? "next" : "upcoming",
      sessions: entry.sessions.map((sx) => {
        const code = sessionCode(sx.label);
        return {
          label: sx.label,
          code,
          date: sx.date,
          state:
            parseUtcDateTime(sx.date).getTime() <= now
              ? "completed"
              : currentSession && currentSession.round === entry.round && currentSession.label === sx.label
                ? "current"
                : "upcoming",
          result: parseUtcDateTime(sx.date).getTime() <= now ? sessionResultFor(code, race, winner?.driverName ?? null) : null,
        };
      }),
      poleSitter: race?.poleSitter ?? null,
      results: results.map((r) => ({
        driver: r.driver,
        driverName: r.driverName,
        team: r.team,
        finishPosition: r.finishPosition,
        points: r.points,
        grid: r.grid,
        status: r.status,
      })),
      hasQualifying: entry.sessions.some((sx) => sx.label.toLowerCase().includes("qualif")),
      circuit: race?.circuit ?? entry.circuit ?? null,
      country: race?.country ?? null,
      eventFormat: entry.eventFormat,
      isSprintWeekend,
      weekendStatus: calendarWeekendStatus(entry.status) ?? derivedStatus,
      photoUrls: race?.photoUrls ?? (race?.photoUrl ? [race.photoUrl] : []),
      // Matched on the same (locality, country) pair the archive side already keys circuit
      // photography by - a FastF1 `location` is a city name, exactly what "locality" means there.
      circuitPhotoUrls: findArchiveCircuitByLocation(circuits, race?.circuit ?? entry.circuit ?? "", race?.country ?? null)?.imageUrls ?? [],
      forecast: entry.weatherForecast,
      raceWeather: race?.weather ?? null,
      podium,
      winnerName: winner?.driverName ?? null,
      poleSitterName: results.find((r) => r.driver === race?.poleSitter)?.driverName ?? race?.poleSitter ?? null,
      fastestLap: fastest,
      predicted,
    };
  });
}

export async function getSeasonPageData(year: number, uid: string) {
  // getArchiveDriverIdsByCode only needs the current roster's codes, not races/calendar/teams/
  // profile - chaining it off currentDriversPromise (instead of awaiting the whole Promise.all
  // first, then making this a second, sequential round trip) overlaps it with whatever's still
  // in flight below, rather than sitting entirely after it on the critical path.
  const currentDriversPromise = getAllCurrentDrivers();
  const archiveIdByCodePromise = currentDriversPromise.then((d) => getArchiveDriverIdsByCode(d.map((x) => x.code)));

  const [races, calendarEntries, currentDrivers, currentTeams, profile, archiveIdByCode, circuits] = await Promise.all([
    getRacesByYear(year),
    getCalendarEntriesByYear(year),
    currentDriversPromise,
    getAllCurrentTeams(),
    getUserProfile(uid),
    archiveIdByCodePromise,
    getAllArchiveCircuits(),
  ]);
  const standings = computeStandings(races);

  const headshotByCode = new Map(currentDrivers.map((d) => [d.code, d.headshotUrl]));
  const logoByTeam = new Map(currentTeams.map((t) => [t.name, t.logoUrl]));

  const drivers: DriverStandingRow[] = standings.drivers.map((d) => ({
    ...d,
    headshotUrl: headshotByCode.get(d.driver) ?? null,
    teamLogoUrl: logoByTeam.get(d.team) ?? null,
    favoriteId: archiveIdByCode.get(d.driver) ?? null,
  }));
  const constructors: ConstructorStandingRow[] = standings.constructors.map((c) => ({
    ...c,
    logoUrl: logoByTeam.get(c.team) ?? null,
    favoriteId: archiveSlugForCurrentTeam(c.team),
  }));

  // Every driver who's actually scored, not a fixed top-N — the Progression view's Top 5 (real
  // standings top 5)/Following/Custom selectors all filter this same, already-fetched dataset
  // client-side, so switching between them is instant, no new request.
  const scoredCodes = drivers.filter((d) => d.points > 0).map((d) => d.driver);
  const progression = scoredCodes.length > 0 ? computeChampionshipProgression(races, scoredCodes) : [];

  const raceSummaries = buildRaceSummaries(races, calendarEntries, circuits);
  const completedCount = completedRoundCount(raceSummaries);

  return {
    year,
    drivers,
    constructors,
    progression,
    raceSummaries,
    racesCompleted: completedCount,
    racesRemaining: raceSummaries.length - completedCount,
    battles: buildBattles(drivers, constructors, raceSummaries),
    records: buildRecords(drivers, constructors, raceSummaries),
    favoriteDriverIds: profile?.favoriteDrivers ?? [],
    favoriteTeamIds: profile?.favoriteTeams ?? [],
  };
}

// "Finished" / "+N Lap(s)" / everything else (Retired, Accident, Engine, DNF, ...) — the exact
// same three-way read ArchiveRaceDashboard.tsx's own per-race isRetired check already uses, just
// applied per season-wide result row here instead of one race's worth.
function archiveFinishStatus(status: string): RaceResultSummary["status"] {
  if (status === "Finished") return "finished";
  if (/^\+\d+ Lap/.test(status)) return "lapped";
  return "dnf";
}

// computeChampionshipProgression's exact reduction (cumulative points per round, one column per
// driver), over ArchiveRaceDoc/driverId instead of RaceDoc/driver-code — kept as its own small
// function rather than a shared generic across two field-incompatible shapes for one caller each.
function computeArchiveProgression(races: ArchiveRaceDoc[], driverIds: string[]): Record<string, number | string>[] {
  const sorted = [...races].sort((a, b) => a.round - b.round);
  const running: Record<string, number> = {};
  for (const id of driverIds) running[id] = 0;
  return sorted.map((race) => {
    for (const r of race.results) if (r.driverId in running) running[r.driverId] += r.points;
    return { round: race.round, raceName: race.raceName, trackShort: trackShortForm(race.circuitName ?? race.raceName), ...running };
  });
}

/** The archive-backed counterpart to getSeasonPageData, same return shape, for every year that
 * isn't the live season — archive_races is the richer, complete source for any year that's
 * already over (real pit-stops/qualifying/lap data races.ts never has at all), not a fallback.
 * See getSeasonDetailData below for which of the two this actually calls. */
async function getArchiveSeasonDetailData(year: number, uid: string) {
  const [races, currentTeams, profile, circuits] = await Promise.all([getArchiveSeason(year), getAllCurrentTeams(), getUserProfile(uid), getAllArchiveCircuits()]);
  // Only this season's own drivers (~20-40 ids), not every driver the archive has ever had (805
  // rows and growing) - getAllArchiveDrivers() was the wrong tool here, a real slowdown on a page
  // that now loads on every single archive year visit, not just the rare "browse all drivers" one.
  const driverIds = [...new Set(races.flatMap((r) => r.results.map((res) => res.driverId)))];
  const photoByDriverId = await getArchiveDriverPhotosByIds(driverIds);
  // archive_teams itself has no logo column, but a team that's still on the current grid (Ferrari,
  // McLaren, Red Bull, ...) has the exact same real logo today as it did that season - reusing the
  // same archiveSlugForCurrentTeam mapping favoriteId below is already keyed by, not a new lookup.
  // A defunct team (Tyrrell, Arrows, Brabham, ...) genuinely has no match here and falls back to
  // the letter-badge, same as before - a real data gap, not a rendering bug.
  const logoBySlug = new Map(currentTeams.map((t) => [archiveSlugForCurrentTeam(t.name), t.logoUrl]));

  const driverMap = new Map<string, DriverStandingRow>();
  const constructorMap = new Map<string, ConstructorStandingRow>();
  for (const race of races) {
    for (const r of race.results) {
      const driver = driverMap.get(r.driverId) ?? {
        driver: r.driverId,
        driverName: r.driverName,
        team: r.constructor,
        points: 0,
        wins: 0,
        podiums: 0,
        headshotUrl: photoByDriverId.get(r.driverId) ?? null,
        teamLogoUrl: null, // filled in below, once every constructor's own logoUrl is resolved
        favoriteId: r.driverId, // already the id space favoriteDrivers is keyed by, no lookup needed
      };
      driver.team = r.constructor;
      driver.points += r.points;
      if (r.position === 1) driver.wins += 1;
      if (r.position <= 3) driver.podiums += 1;
      driverMap.set(r.driverId, driver);

      const favoriteId = r.teamId ?? teamSlug(r.constructor);
      const constructor = constructorMap.get(r.constructor) ?? {
        team: r.constructor,
        points: 0,
        wins: 0,
        podiums: 0,
        logoUrl: logoBySlug.get(favoriteId) ?? null,
        favoriteId,
      };
      constructor.points += r.points;
      if (r.position === 1) constructor.wins += 1;
      if (r.position <= 3) constructor.podiums += 1;
      constructorMap.set(r.constructor, constructor);
    }
  }
  const drivers = [...driverMap.values()].sort((a, b) => b.points - a.points || b.wins - a.wins);
  const constructors = [...constructorMap.values()].sort((a, b) => b.points - a.points || b.wins - a.wins);
  const logoByTeamName = new Map(constructors.map((c) => [c.team, c.logoUrl]));
  for (const d of drivers) d.teamLogoUrl = logoByTeamName.get(d.team) ?? null;

  const raceSummaries: RaceSummary[] = races.map((r) => {
    const results = r.results.map((res) => ({
      driver: res.driverId,
      driverName: res.driverName,
      team: res.constructor,
      finishPosition: res.position,
      points: res.points,
      grid: res.grid,
      status: archiveFinishStatus(res.status),
    }));
    const winner = results.find((res) => res.finishPosition === 1) ?? null;
    const poleSitter = r.qualifying?.find((q) => q.position === 1)?.driverId ?? results.find((res) => res.grid === 1)?.driver ?? null;
    return {
      round: r.round,
      name: r.raceName,
      trackShort: trackShortForm(r.circuitName ?? r.raceName),
      raceDate: r.raceDate,
      state: "completed" as const,
      sessions: r.raceDate
        ? [{ label: "Race", code: "R", date: r.raceDate, state: "completed" as const, result: winner ? { label: "Winner", value: winner.driverName } : null }]
        : [],
      poleSitter,
      results,
      hasQualifying: !!r.qualifying?.length,
      // Archive rounds are complete by construction, so forecast/session-weather/pre-race
      // prediction genuinely don't exist for them (those belong to the live FastF1 pipeline) - but
      // photos and country DO exist on archive_races and were previously discarded here rather
      // than actually being absent, which was the real cause of archive rounds showing no image
      // far more often than the data justified.
      circuit: r.circuitName ?? null,
      country: r.country ?? null,
      eventFormat: null,
      isSprintWeekend: false,
      weekendStatus: "completed" as const,
      photoUrls: r.photoUrls ?? (r.photoUrl ? [r.photoUrl] : []),
      circuitPhotoUrls: findArchiveCircuitByLocation(circuits, r.locality ?? "", r.country)?.imageUrls ?? [],
      forecast: null,
      raceWeather: null,
      podium: results
        .filter((res) => res.finishPosition <= 3)
        .sort((a, b) => a.finishPosition - b.finishPosition)
        .map((res) => ({ position: res.finishPosition, driver: res.driver, driverName: res.driverName, team: res.team })),
      winnerName: winner?.driverName ?? null,
      poleSitterName: results.find((res) => res.driver === poleSitter)?.driverName ?? poleSitter,
      fastestLap: null,
      predicted: null,
    };
  });

  const scoredIds = drivers.filter((d) => d.points > 0).map((d) => d.driver);
  const progression = scoredIds.length > 0 ? computeArchiveProgression(races, scoredIds) : [];

  return {
    year,
    drivers,
    constructors,
    progression,
    raceSummaries,
    racesCompleted: raceSummaries.length,
    racesRemaining: 0, // true by construction — archive only ever covers seasons that are already over
    battles: buildBattles(drivers, constructors, raceSummaries),
    records: buildRecords(drivers, constructors, raceSummaries),
    favoriteDriverIds: profile?.favoriteDrivers ?? [],
    favoriteTeamIds: profile?.favoriteTeams ?? [],
  };
}

/** "ongoing" for the one live season (races/calendar's FastF1 pipeline — prediction/pole/
 * simulation data lives only here); "completed" for every other year, current or historical,
 * which archive_races covers more completely than races.ts ever does once a season is over.
 * Compares against the computed current year, not a literal — the same non-hardcoded pattern
 * ARCHIVE_LATEST_YEAR and /season/page.tsx's own redirect already use. */
export function seasonStatus(year: number): "ongoing" | "completed" {
  return year === new Date().getFullYear() ? "ongoing" : "completed";
}

/** The one entry point both /season and /archive/[year] call — same return shape either way, only
 * the data source differs, picked by seasonStatus, never a per-page assumption. */
export async function getSeasonDetailData(year: number, uid: string) {
  const status = seasonStatus(year);
  const data = status === "ongoing" ? await getSeasonPageData(year, uid) : await getArchiveSeasonDetailData(year, uid);
  return { ...data, status };
}
