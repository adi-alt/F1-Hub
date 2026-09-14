import {
  ARCHIVE_EARLIEST_YEAR,
  ARCHIVE_LATEST_YEAR,
  getAllArchiveCircuits,
  getAllArchiveDrivers,
  getAllArchiveTeams,
  getArchiveCircuit,
  getArchiveDriver,
  getArchiveRace,
  getArchiveRaceLaps,
  getArchiveRacesByCircuitId,
  getArchiveRacesByDriver,
  getArchiveRacesByTeam,
  getArchiveSeason,
  getArchiveTeam,
  getArchiveYearStats,
  type ArchiveCircuit,
  type CurrentLeader,
} from "@/lib/supabase/archive";
import { resolveCurrentCircuitToArchiveId } from "@/lib/circuitSlug";
import { getAllCurrentTeams } from "@/lib/supabase/media";
import { getRacesByYear } from "@/lib/supabase/races";
import { computeStandings } from "@/lib/standings";
import { archiveSlugForCurrentTeam } from "@/lib/teamSlug";

export { ARCHIVE_EARLIEST_YEAR, ARCHIVE_LATEST_YEAR };

export function getArchiveYears(): number[] {
  return Array.from({ length: ARCHIVE_LATEST_YEAR - ARCHIVE_EARLIEST_YEAR + 1 }, (_, i) => ARCHIVE_LATEST_YEAR - i);
}

export async function getArchiveSeasonData(year: number) {
  return getArchiveSeason(year);
}

export async function getArchiveYearStatsData() {
  return getArchiveYearStats();
}

export async function getArchiveRaceData(year: number, round: number) {
  return getArchiveRace(year, round);
}

export async function getArchiveRaceLapsData(year: number, round: number) {
  return getArchiveRaceLaps(year, round);
}

export async function getArchiveCircuitData(circuitId: string) {
  return getArchiveCircuit(circuitId);
}

export async function getAllArchiveCircuitsData() {
  return getAllArchiveCircuits();
}

export async function getArchiveCircuitHistoryData(circuitId: string) {
  return getArchiveRacesByCircuitId(circuitId);
}

export async function getAllArchiveDriversData() {
  return getAllArchiveDrivers();
}

// The driver detail page previously never fetched the driver's own archive_drivers row at all -
// its name was derived from a result row and it had no photo/race-count/first-last-year to build
// a real header from. This is the single-entity fetch getArchiveTeamData/getArchiveCircuitData
// already had, that the driver route was missing.
export async function getArchiveDriverData(driverId: string) {
  return getArchiveDriver(driverId);
}

export async function getArchiveDriverHistoryData(driverId: string) {
  return getArchiveRacesByDriver(driverId);
}

export async function getAllArchiveTeamsData() {
  return getAllArchiveTeams();
}

// Moved here from archive/page.tsx (was a page-local function) so the ask-apex route's By
// Track/By Team grounding builders can resolve the exact same "active this season" reconciliation
// the page itself uses for its status badges/filters - not a second, potentially drifting
// definition of "active." A Firestore/current-season outage degrades this to "everything reads as
// historical" rather than failing whichever caller invoked it - same best-effort contract as
// before the move.
/** Reconciles the current season's own roster against the archive - the same direction of the
 * current-season <-> archive matching problem src/app/profile/page.tsx's mergeCurrentSeason
 * already solves (there: fold this year's names into the archive-sourced favorite lists; here:
 * flag which existing archive circuits/teams are also this year's), reusing the exact same
 * resolver functions rather than writing a second matching implementation. Also derives
 * `currentLeader` from the same current-season fetch, so as not to duplicate it - this year's
 * points leader, computed with the same pure computeStandings the season page itself uses, for
 * the year-card hover tooltip on the in-progress season (which the archive has no rows for at
 * all). Best-effort: if the current season's own data can't be read right now, everything just
 * degrades to "historical, no leader" rather than crashing the whole caller over one extra
 * cross-reference. */
export async function getActiveIds(circuits: ArchiveCircuit[]): Promise<{ circuitIds: string[]; teamIds: string[]; currentLeader: CurrentLeader }> {
  const empty = { circuitIds: [], teamIds: [], currentLeader: { driver: null, team: null } };
  try {
    const year = new Date().getFullYear();
    const [races, currentTeams] = await Promise.all([getRacesByYear(year), getAllCurrentTeams()]);
    const circuitLocalities = new Map(circuits.filter((c) => c.locality).map((c) => [c.circuitId, c.locality as string]));
    const circuitIdsByName = new Map(circuits.map((c) => [(c.name ?? c.circuitId).trim().toLowerCase(), c.circuitId]));

    const circuitIds = new Set<string>();
    for (const race of races) {
      const resolved = resolveCurrentCircuitToArchiveId(race.circuit, circuitLocalities, circuitIdsByName);
      if (resolved) circuitIds.add(resolved);
    }
    const teamIds = currentTeams.map((t) => archiveSlugForCurrentTeam(t.name));

    const standings = computeStandings(races);
    const topDriver = standings.drivers[0];
    const topTeam = standings.constructors[0];
    const currentLeader: CurrentLeader = {
      driver: topDriver ? { name: topDriver.driverName, points: topDriver.points } : null,
      team: topTeam ? { name: topTeam.team, points: topTeam.points } : null,
    };

    return { circuitIds: [...circuitIds], teamIds, currentLeader };
  } catch (error) {
    console.error("getActiveIds: current-season reconciliation failed, treating everything as historical:", error);
    return empty;
  }
}

export async function getArchiveTeamData(teamId: string) {
  return getArchiveTeam(teamId);
}

export async function getArchiveTeamHistoryData(teamId: string) {
  return getArchiveRacesByTeam(teamId);
}
