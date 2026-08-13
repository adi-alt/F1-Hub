import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";

const COLLECTION = "archive_races";
// Historical results never change — this is really "cache forever," but unstable_cache needs a
// number, and a day is close enough to forever for a page nobody expects to update live.
const REVALIDATE_SECONDS = 86400;

// fetch_archive.py's backfill range — the boundary where FastF1-native `races` data begins.
export const ARCHIVE_EARLIEST_YEAR = 1950;
export const ARCHIVE_LATEST_YEAR = 2017;

export type ArchiveResultEntry = {
  position: number;
  positionText: string;
  grid: number | null;
  laps: number | null;
  status: string;
  points: number;
  driverId: string;
  driverName: string;
  constructor: string;
};

export type ArchiveRaceDoc = {
  id: string;
  year: number;
  round: number;
  raceName: string;
  circuitName: string | null;
  locality: string | null;
  country: string | null;
  raceDate: string | null;
  results: ArchiveResultEntry[];
};

/** A season's races — no `.orderBy("round")` on purpose, same reasoning as `calendar` in
 * races.ts: that would need a composite index this collection doesn't have. Sorted here instead. */
export const getArchiveSeason = unstable_cache(
  async (year: number): Promise<ArchiveRaceDoc[]> => {
    const snap = await adminDb.collection(COLLECTION).where("year", "==", year).get();
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<ArchiveRaceDoc, "id">) }))
      .sort((a, b) => a.round - b.round);
  },
  ["get-archive-season"],
  { revalidate: REVALIDATE_SECONDS },
);

export const getArchiveRace = unstable_cache(
  async (year: number, round: number): Promise<ArchiveRaceDoc | null> => {
    const snap = await adminDb
      .collection(COLLECTION)
      .where("year", "==", year)
      .where("round", "==", round)
      .limit(1)
      .get();
    if (snap.empty) return null;
    return { id: snap.docs[0].id, ...(snap.docs[0].data() as Omit<ArchiveRaceDoc, "id">) };
  },
  ["get-archive-race"],
  { revalidate: REVALIDATE_SECONDS },
);
