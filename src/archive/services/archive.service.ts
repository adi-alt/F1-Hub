import { ARCHIVE_EARLIEST_YEAR, ARCHIVE_LATEST_YEAR, getArchiveRace, getArchiveSeason } from "@/lib/firestore/archive";

export { ARCHIVE_EARLIEST_YEAR, ARCHIVE_LATEST_YEAR };

export function getArchiveYears(): number[] {
  return Array.from({ length: ARCHIVE_LATEST_YEAR - ARCHIVE_EARLIEST_YEAR + 1 }, (_, i) => ARCHIVE_LATEST_YEAR - i);
}

export async function getArchiveSeasonData(year: number) {
  return getArchiveSeason(year);
}

export async function getArchiveRaceData(year: number, round: number) {
  return getArchiveRace(year, round);
}
