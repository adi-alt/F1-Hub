import { getArchiveDriverIdsByCode, getArchiveDriverPhotosByIds, getArchiveSeason } from "@/lib/supabase/archive";
import { getCalendarEntriesByYear } from "@/lib/supabase/calendar";
import { getAllCurrentDrivers, getAllCurrentTeams } from "@/lib/supabase/media";
import { getRacesByYear } from "@/lib/supabase/races";
import { getUserProfile } from "@/lib/supabase/users";
import { parseUtcDateTime } from "@/lib/countdown";
import { trackShortForm } from "@/lib/format";
import { computeChampionshipProgression } from "@/lib/personalization";
import { sessionCode } from "@/lib/sessionCode";
import { computeStandings } from "@/lib/standings";
import { archiveSlugForCurrentTeam, teamSlug } from "@/lib/teamSlug";
import { buildBattles, buildRecords } from "./season.pure";
import type { CalendarEntry } from "@/lib/supabase/calendar";
import type { ArchiveRaceDoc } from "@/lib/supabase/archive";
import type { RaceDoc } from "@/lib/types/race";
import type { DriverStandingRow, ConstructorStandingRow, RaceResultSummary, RaceSummary } from "./season.pure";

// Every type and pure deterministic computation (buildBattles, buildRecords, computeHeadToHead,
// computeRecentForm, computeStreaks, computePositionChanges) lives in season.pure.ts instead of
// here - that file has zero supabaseAdmin/getUserProfile imports, so client components (which
// pull in SeasonDetail.tsx as a "use client" module) can import the pure functions directly
// without dragging server-only code into the browser bundle. Re-exported here so every existing
// server-side caller (and the test file) can keep importing from "./season.service" unchanged.
export * from "./season.pure";

function buildRaceSummaries(races: RaceDoc[], calendarEntries: CalendarEntry[]): RaceSummary[] {
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
    return {
      round: entry.round,
      name: entry.name ?? `Round ${entry.round}`,
      trackShort: trackShortForm(race?.circuit ?? entry.circuit ?? entry.name ?? `R${entry.round}`),
      raceDate: entry.raceDate,
      state: completed ? "completed" : entry.round === nextRound ? "next" : "upcoming",
      sessions: entry.sessions.map((s) => ({
        label: s.label,
        code: sessionCode(s.label),
        date: s.date,
        state:
          parseUtcDateTime(s.date).getTime() <= now
            ? "completed"
            : currentSession && currentSession.round === entry.round && currentSession.label === s.label
              ? "current"
              : "upcoming",
      })),
      poleSitter: race?.poleSitter ?? null,
      results: completed
        ? (race?.results ?? []).map((r) => ({
            driver: r.driver,
            driverName: r.driverName,
            team: r.team,
            finishPosition: r.finishPosition,
            points: r.points,
            grid: r.grid,
            status: r.status,
          }))
        : [],
      hasQualifying: entry.sessions.some((s) => s.label.toLowerCase().includes("qualif")),
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

  const [races, calendarEntries, currentDrivers, currentTeams, profile, archiveIdByCode] = await Promise.all([
    getRacesByYear(year),
    getCalendarEntriesByYear(year),
    currentDriversPromise,
    getAllCurrentTeams(),
    getUserProfile(uid),
    archiveIdByCodePromise,
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

  const raceSummaries = buildRaceSummaries(races, calendarEntries);
  const completedCount = raceSummaries.filter((r) => r.state === "completed").length;

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
  const [races, currentTeams, profile] = await Promise.all([getArchiveSeason(year), getAllCurrentTeams(), getUserProfile(uid)]);
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

  const raceSummaries: RaceSummary[] = races.map((r) => ({
    round: r.round,
    name: r.raceName,
    trackShort: trackShortForm(r.circuitName ?? r.raceName),
    raceDate: r.raceDate,
    state: "completed",
    sessions: r.raceDate ? [{ label: "Race", code: "R", date: r.raceDate, state: "completed" }] : [],
    poleSitter: r.qualifying?.find((q) => q.position === 1)?.driverId ?? r.results.find((res) => res.grid === 1)?.driverId ?? null,
    results: r.results.map((res) => ({
      driver: res.driverId,
      driverName: res.driverName,
      team: res.constructor,
      finishPosition: res.position,
      points: res.points,
      grid: res.grid,
      status: archiveFinishStatus(res.status),
    })),
    hasQualifying: !!r.qualifying?.length,
  }));

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
