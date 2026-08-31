import { getArchiveDriverIdsByCode, getArchiveDriverPhotosByIds, getArchiveSeason } from "@/lib/supabase/archive";
import { getCalendarEntriesByYear } from "@/lib/supabase/calendar";
import { getAllCurrentDrivers, getAllCurrentTeams } from "@/lib/supabase/media";
import { getRacesByYear } from "@/lib/supabase/races";
import { getUserProfile } from "@/lib/supabase/users";
import { trackShortForm } from "@/lib/format";
import { computeChampionshipProgression } from "@/lib/personalization";
import { computeStandings, type ConstructorStanding, type DriverStanding } from "@/lib/standings";
import { archiveSlugForCurrentTeam, teamSlug } from "@/lib/teamSlug";
import type { CalendarEntry } from "@/lib/supabase/calendar";
import type { ArchiveRaceDoc } from "@/lib/supabase/archive";
import type { RaceDoc } from "@/lib/types/race";

export type DriverStandingRow = DriverStanding & {
  headshotUrl: string | null;
  // Same lookup the constructors row uses for its own logoUrl — carried here too so a driver row
  // can show both the driver's headshot and their team's logo at once, instead of the team only
  // ever appearing as plain text on the Drivers view (and only getting a logo on Constructors).
  teamLogoUrl: string | null;
  // archive_drivers.driver_id — the id space `profile.favoriteDrivers` is actually keyed by, not
  // this row's own 3-letter code. Null when that driver hasn't been code-matched into the archive
  // yet (see getArchiveDriverIdsByCode) — favoriting is disabled for that row until it has.
  favoriteId: string | null;
};

export type ConstructorStandingRow = ConstructorStanding & {
  logoUrl: string | null;
  favoriteId: string; // archiveSlugForCurrentTeam is a pure string mapping — always resolvable, no lookup needed
};

export type RaceResultSummary = {
  driver: string;
  driverName: string;
  team: string;
  finishPosition: number;
  points: number;
  grid: number | null;
  status: "finished" | "lapped" | "dnf";
};

// FastF1 (see pipeline/sync_calendar.py's own all_sessions()) writes whatever a weekend's
// sessions are actually called ("Practice 1", "Sprint Qualifying", "Sprint Shootout", "Race", …)
// rather than a fixed 5-slot enum, since the sprint format itself has changed session names across
// seasons. Reading a short code back out the same way — by substring, not an exhaustive lookup —
// means a future rename doesn't quietly fall through to an unlabeled cell.
function sessionCode(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("practice")) return `P${l.match(/\d/)?.[0] ?? ""}`;
  if (l.includes("sprint") && (l.includes("qualif") || l.includes("shootout"))) return "SQ";
  if (l.includes("sprint")) return "SR";
  if (l.includes("qualif")) return "Q";
  if (l.includes("race")) return "R";
  return label.slice(0, 2).toUpperCase();
}

export type RaceSessionSummary = { label: string; code: string; date: string; state: "completed" | "current" | "upcoming" };

// One entry per round of the *whole* season (including rounds with no FastF1 data yet) — the
// single structure behind the season calendar, the per-track comparison breakdown, and every
// derived driver/team stat (avg finish, poles, DNFs) that needs "every completed race" instead of
// just the current totals. `state` is the race-level summary (done/next/upcoming); `sessions` is
// the session-by-session breakdown the calendar's own grid renders.
export type RaceSummary = {
  round: number;
  name: string;
  trackShort: string;
  raceDate: string | null;
  state: "completed" | "next" | "upcoming";
  sessions: RaceSessionSummary[];
  poleSitter: string | null;
  results: RaceResultSummary[]; // [] until the race is actually completed
  // For archive-backed years, `sessions` only ever has one entry (raceDate is the only date the
  // schema stores - no per-session dates exist pre-live-season, see getArchiveSeasonDetailData) -
  // this says whether real qualifying *results* still exist for that same race, so the calendar's
  // tooltip can say so without fabricating a session date. Always true on the live-season path,
  // where qualifying already shows as its own dated session tile.
  hasQualifying: boolean;
};

function buildRaceSummaries(races: RaceDoc[], calendarEntries: CalendarEntry[]): RaceSummary[] {
  const raceByRound = new Map(races.map((r) => [r.round, r]));
  const sorted = [...calendarEntries].sort((a, b) => a.round - b.round);

  const now = Date.now();
  const nextRound = sorted.find((e) => e.raceDate && new Date(e.raceDate).getTime() > now)?.round;

  // The single "what's happening next" pointer, but at session granularity instead of race
  // granularity — every session across the whole season, chronologically, so each weekend's
  // sessions can be marked completed/current/upcoming individually instead of the whole weekend
  // switching state at once.
  const allSessions = sorted
    .flatMap((e) => e.sessions.map((s) => ({ ...s, round: e.round })))
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());
  const currentSession = allSessions.find((s) => new Date(s.date).getTime() > now);

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
          new Date(s.date).getTime() <= now
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

export type Battle = {
  type: "drivers" | "constructors";
  aId: string;
  aLabel: string;
  aValue: number;
  bId: string;
  bLabel: string;
  bValue: number;
  gap: number;
};

// Adjacent-in-the-standings gaps, drivers and constructors both, tightest first — clicking one
// (see AnalysisWorkspace.tsx) opens Compare with that exact pair pre-selected. Exported — the
// archive-backed path below (getArchiveSeasonDetailData) reuses this verbatim, since it only ever
// takes the already-shared DriverStandingRow/ConstructorStandingRow shape, not RaceDoc.
export function buildBattles(drivers: DriverStandingRow[], constructors: ConstructorStandingRow[]): Battle[] {
  const battles: Battle[] = [];
  for (let i = 0; i < drivers.length - 1; i++) {
    battles.push({
      type: "drivers",
      aId: drivers[i].driver,
      aLabel: drivers[i].driverName,
      aValue: drivers[i].points,
      bId: drivers[i + 1].driver,
      bLabel: drivers[i + 1].driverName,
      bValue: drivers[i + 1].points,
      gap: drivers[i].points - drivers[i + 1].points,
    });
  }
  for (let i = 0; i < constructors.length - 1; i++) {
    battles.push({
      type: "constructors",
      aId: constructors[i].team,
      aLabel: constructors[i].team,
      aValue: constructors[i].points,
      bId: constructors[i + 1].team,
      bLabel: constructors[i + 1].team,
      bValue: constructors[i + 1].points,
      gap: constructors[i].points - constructors[i + 1].points,
    });
  }
  return battles.sort((a, b) => a.gap - b.gap).slice(0, 6);
}

// `name` is the driver/team/pairing the record belongs to (shown at normal weight); `value` is
// the number itself, meant to read as the strongest text in the row — kept apart instead of one
// pre-joined string so the records view can give the two very different visual weight.
export type SeasonRecord = { label: string; name: string; value: string };

// A compact reference grid, not the old rotating "fun facts" widget — deterministic, since this
// is meant to be looked up, not rediscovered on every visit. Exported for the same reason as
// buildBattles above.
export function buildRecords(drivers: DriverStandingRow[], constructors: ConstructorStandingRow[], raceSummaries: RaceSummary[]): SeasonRecord[] {
  const records: SeasonRecord[] = [];
  const completed = raceSummaries.filter((r) => r.state === "completed");

  const mostWins = [...drivers].sort((a, b) => b.wins - a.wins)[0];
  if (mostWins?.wins > 0) records.push({ label: "Most wins", name: mostWins.driverName, value: String(mostWins.wins) });

  const mostPodiums = [...drivers].sort((a, b) => b.podiums - a.podiums)[0];
  if (mostPodiums?.podiums > 0) records.push({ label: "Most podiums", name: mostPodiums.driverName, value: String(mostPodiums.podiums) });

  const poleCounts = new Map<string, number>();
  for (const r of completed) if (r.poleSitter) poleCounts.set(r.poleSitter, (poleCounts.get(r.poleSitter) ?? 0) + 1);
  const topPole = [...poleCounts.entries()].sort((a, b) => b[1] - a[1])[0];
  if (topPole) {
    const d = drivers.find((x) => x.driver === topPole[0]);
    records.push({ label: "Most poles", name: d?.driverName ?? topPole[0], value: String(topPole[1]) });
  }

  const avgFinishByDriver = new Map<string, number[]>();
  for (const r of completed) {
    for (const res of r.results) {
      const positions = avgFinishByDriver.get(res.driver);
      if (positions) positions.push(res.finishPosition);
      else avgFinishByDriver.set(res.driver, [res.finishPosition]);
    }
  }
  let bestAvg: { code: string; avg: number } | null = null;
  for (const [code, positions] of avgFinishByDriver) {
    if (positions.length < 3) continue; // needs a real sample, not one lucky race
    const avg = positions.reduce((s, p) => s + p, 0) / positions.length;
    if (!bestAvg || avg < bestAvg.avg) bestAvg = { code, avg };
  }
  if (bestAvg) {
    const d = drivers.find((x) => x.driver === bestAvg!.code);
    records.push({ label: "Best avg finish", name: d?.driverName ?? bestAvg.code, value: `P${bestAvg.avg.toFixed(1)}` });
  }

  const [leader, second] = drivers;
  if (leader && second) records.push({ label: "Points margin", name: `${leader.driverName} over ${second.driverName}`, value: String(leader.points - second.points) });

  const winners = new Set<string>();
  for (const r of completed) {
    const winner = r.results.find((x) => x.finishPosition === 1);
    if (winner) winners.add(winner.driverName);
  }
  if (winners.size > 0) records.push({ label: "Race winners", name: "Different drivers to win", value: String(winners.size) });

  const topTeam = constructors[0];
  if (topTeam) records.push({ label: "Constructors lead", name: topTeam.team, value: String(topTeam.points) });

  return records;
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
    battles: buildBattles(drivers, constructors),
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
    battles: buildBattles(drivers, constructors),
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
