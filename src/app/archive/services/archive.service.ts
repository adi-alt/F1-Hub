import {
  ARCHIVE_EARLIEST_YEAR,
  ARCHIVE_LATEST_YEAR,
  getAllArchiveCircuits,
  getAllArchiveDrivers,
  getAllArchiveTeams,
  getArchiveCircuit,
  getArchiveRace,
  getArchiveRaceLaps,
  getArchiveRacesByCircuitId,
  getArchiveRacesByDriver,
  getArchiveRacesByTeam,
  getArchiveSeason,
  getArchiveTeam,
  getArchiveYearStats,
} from "@/lib/supabase/archive";

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

export async function getArchiveDriverHistoryData(driverId: string) {
  return getArchiveRacesByDriver(driverId);
}

export async function getAllArchiveTeamsData() {
  return getAllArchiveTeams();
}

export async function getArchiveTeamData(teamId: string) {
  return getArchiveTeam(teamId);
}

export async function getArchiveTeamHistoryData(teamId: string) {
  return getArchiveRacesByTeam(teamId);
}
