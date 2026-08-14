import { unstable_cache } from "next/cache";
import { adminDb } from "@/lib/firebase/admin";

const COLLECTION = "archive_races";
// Historical results never change — this is really "cache forever," but unstable_cache needs a
// number, and a day is close enough to forever for a page nobody expects to update live.
const REVALIDATE_SECONDS = 86400;

// fetch_archive.py's backfill range — 1950 is F1's first season; the upper bound is always
// "last year" (the current season isn't over yet, so it's deliberately never "archived"), not a
// fixed year, so this needs no code change at a year boundary — same reasoning as fetch_races.py
// never hardcoding a year.
export const ARCHIVE_EARLIEST_YEAR = 1950;
export const ARCHIVE_LATEST_YEAR = new Date().getFullYear() - 1;

export type ArchiveFastestLap = {
  rank: number;
  lap: number;
  time: string;
  avgSpeedKph: number | null;
};

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
  // Added by pipeline/enrich_archive.py, alongside the base backfill fields above — absent
  // (undefined, not just null-valued) on any doc that hasn't been enriched yet.
  time?: string | null;
  driverCode?: string | null;
  fastestLap?: ArchiveFastestLap | null;
};

export type ArchiveQualifyingEntry = {
  position: number;
  driverId: string;
  driverName: string;
  constructor: string;
  // Nullable, not just absent when unavailable — eras before the Q1/Q2/Q3 split only ever have a
  // single time (usually stored in q1) or none at all.
  q1: string | null;
  q2: string | null;
  q3: string | null;
};

export type ArchivePitStopEntry = {
  driverId: string;
  stop: number;
  lap: number;
  time: string | null;
  durationSec: number | null;
};

export type ArchiveLapTiming = { driverId: string; time: string | null; position: number | null };
export type ArchiveLapEntry = { lap: number; timings: ArchiveLapTiming[] };

// Raw WMO weather code, not a pre-decoded label — see lib/weatherCodes.ts for the one place that
// mapping lives, so it's not duplicated between this Python-written data and its TS reader.
export type ArchiveWeather = {
  tempMaxC: number;
  tempMinC: number;
  precipitationMm: number;
  windMaxKph: number;
  weatherCode: number;
};

export type ArchiveCircuit = {
  circuitId: string;
  name: string | null;
  wikipediaUrl: string | null;
  imageUrl: string | null;
  lat: number | null;
  long: number | null;
};

export type ArchiveDriver = {
  driverId: string;
  name: string;
  code: string | null;
  firstYear: number;
  lastYear: number;
  raceCount: number;
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
  // All added by pipeline/enrich_archive.py / enrich_archive_laps.py / enrich_archive_circuits.py
  // — undefined on any doc that hasn't been through that particular enrichment pass yet, so every
  // read site treats them as optional rather than assuming they exist.
  wikipediaUrl?: string | null;
  qualifying?: ArchiveQualifyingEntry[];
  pitStops?: ArchivePitStopEntry[];
  lapsBackfilled?: boolean;
  circuitId?: string | null;
  weather?: ArchiveWeather | null;
  // Written by pipeline/enrich_archive_drivers.py — a flat mirror of results[].driverId, purely
  // so "every race this driver ran" can be a real `array-contains` query (see
  // getArchiveRacesByDriver) instead of scanning every doc's nested results array by hand.
  driverIds?: string[];
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

/** One doc per unique circuit (~70-75 total across the whole archive), not per race — a Wikipedia
 * track image and the circuit's own Wikipedia link, written once by
 * pipeline/enrich_archive_circuits.py the first time it sees that circuitId. Null if that pass
 * hasn't reached this circuit yet, same optional-everything pattern as the rest of archive. */
export const getArchiveCircuit = unstable_cache(
  async (circuitId: string): Promise<ArchiveCircuit | null> => {
    const snap = await adminDb.collection("archive_circuits").doc(circuitId).get();
    return snap.exists ? (snap.data() as ArchiveCircuit) : null;
  },
  ["get-archive-circuit"],
  { revalidate: REVALIDATE_SECONDS },
);

/** Every circuit that's been through pipeline/enrich_archive_circuits.py — a small collection
 * (~100-150 once the archive covers 1950-last year), so listing all of it for the "browse by
 * track" landing grid is cheap. No stable order in Firestore — sorted by name here. */
export const getAllArchiveCircuits = unstable_cache(
  async (): Promise<ArchiveCircuit[]> => {
    const snap = await adminDb.collection("archive_circuits").get();
    return snap.docs
      .map((d) => d.data() as ArchiveCircuit)
      .sort((a, b) => (a.name ?? a.circuitId).localeCompare(b.name ?? b.circuitId));
  },
  ["get-all-archive-circuits"],
  { revalidate: REVALIDATE_SECONDS },
);

/** A circuit's full history — every race with this `circuitId`, oldest first. Only ever returns
 * races the circuits/weather enrichment pass has actually reached (see `circuitId`'s own comment
 * on ArchiveRaceDoc) — grows as that pass completes, same as everywhere else this field appears. */
export const getArchiveRacesByCircuitId = unstable_cache(
  async (circuitId: string): Promise<ArchiveRaceDoc[]> => {
    const snap = await adminDb.collection(COLLECTION).where("circuitId", "==", circuitId).get();
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<ArchiveRaceDoc, "id">) }))
      .sort((a, b) => a.year - b.year || a.round - b.round);
  },
  ["get-archive-races-by-circuit"],
  { revalidate: REVALIDATE_SECONDS },
);

/** Every driver who's been through pipeline/enrich_archive_drivers.py — for the "browse by
 * racer" landing grid. Sorted by most recent first, since a fresh visitor is more likely
 * recognize recent names than a 1950s one. */
export const getAllArchiveDrivers = unstable_cache(
  async (): Promise<ArchiveDriver[]> => {
    const snap = await adminDb.collection("archive_drivers").get();
    return snap.docs.map((d) => d.data() as ArchiveDriver).sort((a, b) => b.lastYear - a.lastYear);
  },
  ["get-all-archive-drivers"],
  { revalidate: REVALIDATE_SECONDS },
);

/** A driver's career — every race with this driverId in its flat `driverIds` mirror, oldest
 * first. `array-contains` is the only Firestore-native way to query a value inside a nested
 * array of objects, which is why that flat mirror field exists at all. */
export const getArchiveRacesByDriver = unstable_cache(
  async (driverId: string): Promise<ArchiveRaceDoc[]> => {
    const snap = await adminDb.collection(COLLECTION).where("driverIds", "array-contains", driverId).get();
    return snap.docs
      .map((d) => ({ id: d.id, ...(d.data() as Omit<ArchiveRaceDoc, "id">) }))
      .sort((a, b) => a.year - b.year || a.round - b.round);
  },
  ["get-archive-races-by-driver"],
  { revalidate: REVALIDATE_SECONDS },
);

/** Lap-by-lap timing, read on demand (LapChart's "Show lap chart" click, via
 * /api/archive/laps) rather than as part of getArchiveRace — a `laps` subcollection, not a field
 * on the race doc, specifically so this stays a separate, optional read (see
 * pipeline/enrich_archive_laps.py's module docstring for why it's split out: ~1,300 rows for a
 * single race vs. a few dozen for everything else). Empty array, not an error, for any race
 * that's `!lapsBackfilled` or predates 1996 (Ergast has no lap data before then). */
export const getArchiveRaceLaps = unstable_cache(
  async (year: number, round: number): Promise<ArchiveLapEntry[]> => {
    const raceSnap = await adminDb
      .collection(COLLECTION)
      .where("year", "==", year)
      .where("round", "==", round)
      .limit(1)
      .get();
    if (raceSnap.empty) return [];
    const lapsSnap = await raceSnap.docs[0].ref.collection("laps").get();
    return lapsSnap.docs.map((d) => d.data() as ArchiveLapEntry).sort((a, b) => a.lap - b.lap);
  },
  ["get-archive-race-laps"],
  { revalidate: REVALIDATE_SECONDS },
);
