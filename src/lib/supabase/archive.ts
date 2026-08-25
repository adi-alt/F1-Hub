import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

// A day is close enough to "cache forever" for data that changes only when a backfill pass runs
// — real freshness after a pipeline run comes from revalidateTag("archive-data") via
// /api/admin/revalidate (called by the pipeline itself once it finishes), not from this timer.
const REVALIDATE_SECONDS = 86400;
const ARCHIVE_TAG = "archive-data";

// fetch_archive.py's backfill range — 1950 is F1's first season; the upper bound is always
// "last year" (the current season isn't over yet, so it's deliberately never "archived").
export const ARCHIVE_EARLIEST_YEAR = 1950;
export const ARCHIVE_LATEST_YEAR = new Date().getFullYear() - 1;

export type ArchiveFastestLap = { rank: number; lap: number; time: string; avgSpeedKph: number | null };

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
  teamId: string | null; // resolved/canonicalized slug (team_slug()) — null until enrich_archive_entities.py reaches this row
  time?: string | null;
  driverCode?: string | null;
  fastestLap?: ArchiveFastestLap | null;
};

export type ArchiveQualifyingEntry = {
  position: number;
  driverId: string;
  driverName: string;
  constructor: string;
  q1: string | null;
  q2: string | null;
  q3: string | null;
};

export type ArchivePitStopEntry = { driverId: string; stop: number; lap: number; time: string | null; durationSec: number | null };

export type ArchiveLapTiming = { driverId: string; time: string | null; position: number | null };
export type ArchiveLapEntry = { lap: number; timings: ArchiveLapTiming[] };

// Raw WMO weather code, not a pre-decoded label — see lib/weatherCodes.ts for the one place that
// mapping lives.
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
  imageUrls: string[] | null; // real circuit photos (Wikimedia Commons), not the legacy single imageUrl
  lat: number | null;
  long: number | null;
  // Merged in by getAllArchiveCircuits from a full archive_races scan (getArchiveCircuitStats
  // below) — undefined for callers that only read the bare archive_circuits row (getArchiveCircuit).
  raceCount?: number;
  firstYear?: number | null;
  lastYear?: number | null;
  country?: string | null;
  locality?: string | null;
};

export type ArchiveDriver = {
  driverId: string;
  name: string;
  code: string | null;
  firstYear: number;
  lastYear: number;
  raceCount: number;
  constructors?: string[];
  dateOfBirth: string | null; // ISO date — see pipeline/fetch_archive_driver_media.py
  wikipediaUrl: string | null;
  photoUrl: string | null; // Supabase Storage url, re-hosted from wikipediaUrl's lead image
};

export type ArchiveTeam = { teamId: string; name: string; firstYear: number; lastYear: number; raceCount: number; drivers: string[] };

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
  wikipediaUrl?: string | null;
  photoUrl?: string | null; // legacy single photo, superseded by photoUrls below
  photoUrls?: string[] | null; // real photos — see pipeline/enrich_archive.py's backfill_race_photos()
  qualifying?: ArchiveQualifyingEntry[];
  pitStops?: ArchivePitStopEntry[];
  lapsBackfilled?: boolean;
  circuitId?: string | null;
  weather?: ArchiveWeather | null;
};

// Rows as supabase/schema.sql defines them, before translation to the camelCase shape above.
type ArchiveRaceRow = {
  id: string;
  year: number;
  round: number;
  race_name: string;
  circuit_name: string | null;
  locality: string | null;
  country: string | null;
  race_date: string | null;
  wikipedia_url: string | null;
  photo_url: string | null;
  photo_urls: string[] | null;
  weather: ArchiveWeather | null;
  circuit_id: string | null;
  laps_backfilled: boolean;
  archive_results: {
    driver_id: string;
    position: number | null;
    position_text: string | null;
    grid: number | null;
    laps: number | null;
    status: string | null;
    points: number | null;
    driver_name: string;
    constructor: string | null;
    team_id: string | null;
    time: string | null;
    driver_code: string | null;
    fastest_lap: ArchiveFastestLap | null;
  }[];
  archive_qualifying?: {
    driver_id: string;
    position: number;
    driver_name: string;
    constructor: string | null;
    q1: string | null;
    q2: string | null;
    q3: string | null;
  }[];
  archive_pit_stops?: { driver_id: string; stop: number; lap: number; time: string | null; duration_sec: number | null }[];
};

const ARCHIVE_RACE_SELECT = "*, archive_results(*), archive_qualifying(*), archive_pit_stops(*)";

function toArchiveRaceDoc(row: ArchiveRaceRow): ArchiveRaceDoc {
  return {
    id: row.id,
    year: row.year,
    round: row.round,
    raceName: row.race_name,
    circuitName: row.circuit_name,
    locality: row.locality,
    country: row.country,
    raceDate: row.race_date,
    wikipediaUrl: row.wikipedia_url,
    photoUrl: row.photo_url,
    photoUrls: row.photo_urls,
    weather: row.weather,
    circuitId: row.circuit_id,
    lapsBackfilled: row.laps_backfilled,
    // position/positionText/status/points/constructor are non-null in ArchiveResultEntry - a
    // classified result always has them, same "nothing optional-chained defensively" stance
    // races.ts already takes. The DB columns stay nullable (defensive schema), these asserts are
    // just trusting real data the same way the Firestore version always implicitly did.
    results: row.archive_results.map((r) => ({
      position: r.position!,
      positionText: r.position_text!,
      grid: r.grid,
      laps: r.laps,
      status: r.status!,
      points: r.points!,
      driverId: r.driver_id,
      driverName: r.driver_name,
      constructor: r.constructor!,
      teamId: r.team_id,
      time: r.time,
      driverCode: r.driver_code,
      fastestLap: r.fastest_lap,
    })),
    qualifying: row.archive_qualifying?.length
      ? row.archive_qualifying.map((q) => ({
          position: q.position,
          driverId: q.driver_id,
          driverName: q.driver_name,
          constructor: q.constructor!,
          q1: q.q1,
          q2: q.q2,
          q3: q.q3,
        }))
      : undefined,
    pitStops: row.archive_pit_stops?.length
      ? row.archive_pit_stops.map((p) => ({
          driverId: p.driver_id,
          stop: p.stop,
          lap: p.lap,
          time: p.time,
          durationSec: p.duration_sec,
        }))
      : undefined,
  };
}

/** A season's races, oldest round first. */
export const getArchiveSeason = unstable_cache(
  async (year: number): Promise<ArchiveRaceDoc[]> => {
    const { data } = await supabaseAdmin.from("archive_races").select(ARCHIVE_RACE_SELECT).eq("year", year).order("round");
    return ((data ?? []) as ArchiveRaceRow[]).map(toArchiveRaceDoc);
  },
  ["get-archive-season"],
  { revalidate: REVALIDATE_SECONDS, tags: [ARCHIVE_TAG] },
);

export const getArchiveRace = unstable_cache(
  async (year: number, round: number): Promise<ArchiveRaceDoc | null> => {
    const { data } = await supabaseAdmin
      .from("archive_races")
      .select(ARCHIVE_RACE_SELECT)
      .eq("year", year)
      .eq("round", round)
      .maybeSingle();
    return data ? toArchiveRaceDoc(data as ArchiveRaceRow) : null;
  },
  ["get-archive-race"],
  { revalidate: REVALIDATE_SECONDS, tags: [ARCHIVE_TAG] },
);

type ArchiveCircuitRow = {
  circuit_id: string;
  name: string | null;
  wikipedia_url: string | null;
  image_url: string | null;
  image_urls: string[] | null;
  lat: number | null;
  long: number | null;
};

function toArchiveCircuit(row: ArchiveCircuitRow): ArchiveCircuit {
  return {
    circuitId: row.circuit_id,
    name: row.name,
    wikipediaUrl: row.wikipedia_url,
    imageUrl: row.image_url,
    imageUrls: row.image_urls,
    lat: row.lat,
    long: row.long,
  };
}

/** One row per unique circuit (~70-75 total across the whole archive), not per race — a Wikipedia
 * track image and the circuit's own Wikipedia link, written once by
 * pipeline/enrich_archive_circuits.py the first time it sees that circuit_id. Null if that pass
 * hasn't reached this circuit yet. */
export const getArchiveCircuit = unstable_cache(
  async (circuitId: string): Promise<ArchiveCircuit | null> => {
    const { data } = await supabaseAdmin.from("archive_circuits").select("*").eq("circuit_id", circuitId).maybeSingle();
    return data ? toArchiveCircuit(data as ArchiveCircuitRow) : null;
  },
  ["get-archive-circuit"],
  { revalidate: REVALIDATE_SECONDS, tags: [ARCHIVE_TAG] },
);

type CircuitStats = { raceCount: number; firstYear: number; lastYear: number; country: string | null; locality: string | null };

/** One full (but field-projected) scan of archive_races, grouped by `circuit_name` in JS — the
 * race-count/year-span/country/locality "key info" shown on each track tile. Grouped by name
 * rather than `circuit_id` deliberately: `circuit_id` only exists on however many races
 * pipeline/enrich_archive_circuits.py has reached so far (a small, slowly-growing slice of the
 * archive), while `circuit_name` has been on every race doc since the very first fetch. Kept as a
 * plain grouped scan (not a SQL GROUP BY view) since that's the exact same cost/shape the
 * original Firestore version already used, and at ~1,300-2,000 rows, cached for a day, a full
 * scan is cheap enough not to bother standing up a view for. */
const getArchiveCircuitStats = unstable_cache(
  async (): Promise<Record<string, CircuitStats>> => {
    const { data } = await supabaseAdmin.from("archive_races").select("circuit_name, year, country, locality");
    const stats: Record<string, CircuitStats> = {};
    for (const row of (data ?? []) as { circuit_name: string | null; year: number; country: string | null; locality: string | null }[]) {
      if (!row.circuit_name) continue;
      const s = stats[row.circuit_name];
      if (!s) {
        stats[row.circuit_name] = { raceCount: 1, firstYear: row.year, lastYear: row.year, country: row.country, locality: row.locality };
      } else {
        s.raceCount += 1;
        s.firstYear = Math.min(s.firstYear, row.year);
        s.lastYear = Math.max(s.lastYear, row.year);
        if (!s.country && row.country) s.country = row.country;
        if (!s.locality && row.locality) s.locality = row.locality;
      }
    }
    return stats;
  },
  ["get-archive-circuit-stats"],
  { revalidate: REVALIDATE_SECONDS, tags: [ARCHIVE_TAG] },
);

/** Every circuit that's been through pipeline/enrich_archive_circuits.py — a small table
 * (~100-150 once the archive covers 1950-last year), so listing all of it for the "browse by
 * track" landing grid is cheap. */
export const getAllArchiveCircuits = unstable_cache(
  async (): Promise<ArchiveCircuit[]> => {
    const [{ data }, stats] = await Promise.all([supabaseAdmin.from("archive_circuits").select("*"), getArchiveCircuitStats()]);
    return ((data ?? []) as ArchiveCircuitRow[])
      .map((row) => {
        const circuit = toArchiveCircuit(row);
        const s = stats[circuit.name ?? ""];
        return {
          ...circuit,
          raceCount: s?.raceCount ?? 0,
          firstYear: s?.firstYear ?? null,
          lastYear: s?.lastYear ?? null,
          country: s?.country ?? null,
          locality: s?.locality ?? null,
        };
      })
      .sort((a, b) => (a.name ?? a.circuitId).localeCompare(b.name ?? b.circuitId));
  },
  ["get-all-archive-circuits"],
  { revalidate: REVALIDATE_SECONDS, tags: [ARCHIVE_TAG] },
);

/** A circuit's full history — every race with this circuit_id, oldest first. Only ever returns
 * races the circuits/weather enrichment pass has actually reached. */
export const getArchiveRacesByCircuitId = unstable_cache(
  async (circuitId: string): Promise<ArchiveRaceDoc[]> => {
    const { data } = await supabaseAdmin.from("archive_races").select(ARCHIVE_RACE_SELECT).eq("circuit_id", circuitId).order("year");
    return ((data ?? []) as ArchiveRaceRow[]).map(toArchiveRaceDoc);
  },
  ["get-archive-races-by-circuit"],
  { revalidate: REVALIDATE_SECONDS, tags: [ARCHIVE_TAG] },
);

type ArchiveDriverRow = {
  driver_id: string;
  name: string;
  code: string | null;
  first_year: number;
  last_year: number;
  race_count: number;
  constructors: string[] | null;
  date_of_birth: string | null;
  wikipedia_url: string | null;
  photo_url: string | null;
};

function toArchiveDriver(row: ArchiveDriverRow): ArchiveDriver {
  return {
    driverId: row.driver_id,
    name: row.name,
    code: row.code,
    firstYear: row.first_year,
    lastYear: row.last_year,
    raceCount: row.race_count,
    constructors: row.constructors ?? undefined,
    dateOfBirth: row.date_of_birth,
    wikipediaUrl: row.wikipedia_url,
    photoUrl: row.photo_url,
  };
}

/** Every driver who's been through pipeline/enrich_archive_entities.py — for the "browse by
 * racer" landing grid. Sorted by most recent first, since a fresh visitor is more likely to
 * recognize recent names than a 1950s one. */
export const getArchiveDriver = unstable_cache(
  async (driverId: string): Promise<ArchiveDriver | null> => {
    const { data } = await supabaseAdmin.from("archive_drivers").select("*").eq("driver_id", driverId).maybeSingle();
    return data ? toArchiveDriver(data as ArchiveDriverRow) : null;
  },
  ["get-archive-driver"],
  { revalidate: REVALIDATE_SECONDS, tags: [ARCHIVE_TAG] },
);

export const getAllArchiveDrivers = unstable_cache(
  async (): Promise<ArchiveDriver[]> => {
    const { data } = await supabaseAdmin.from("archive_drivers").select("*");
    return ((data ?? []) as ArchiveDriverRow[]).map(toArchiveDriver).sort((a, b) => b.lastYear - a.lastYear);
  },
  ["get-all-archive-drivers"],
  { revalidate: REVALIDATE_SECONDS, tags: [ARCHIVE_TAG] },
);

/** Reverse lookup for the current season's 3-letter codes -> archive driver_id, e.g. for
 * favoriting a driver directly from the current-season standings table (which only has the code,
 * not the archive id `favoriteDrivers` is actually keyed by). One batched query for a whole
 * grid's worth of codes rather than one round-trip per row - not `unstable_cache`-wrapped since
 * the input is a dynamic array (a poor cache key) and this is already a single cheap indexed
 * lookup, not worth the complexity. Silently omits any code `archive_drivers.code` hasn't been
 * backfilled for yet (see fetch_archive_driver_media.py) - those rows just can't be favorited from
 * here until enrichment catches up, same "graceful gap" as everywhere else in the archive.
 *
 * 3-letter codes are NOT globally unique across F1 history - confirmed live, "ALB" matches both
 * Alexander Albon (current) and Christijan Albers (retired ~2007), "VER" matches both Max
 * Verstappen (current) and Jean-Éric Vergne (retired ~2014). On a collision, keeps whichever
 * archive row has the latest `last_year` - a currently-active driver's own archive row is always
 * the most recently-updated one for that code, so this reliably picks the real match instead of
 * silently keeping whichever row the query happened to return last. */
export async function getArchiveDriverIdsByCode(codes: string[]): Promise<Map<string, string>> {
  if (codes.length === 0) return new Map();
  const { data } = await supabaseAdmin.from("archive_drivers").select("driver_id, code, last_year").in("code", codes);
  const bestByCode = new Map<string, { driverId: string; lastYear: number }>();
  for (const row of (data ?? []) as { driver_id: string; code: string | null; last_year: number }[]) {
    if (!row.code) continue;
    const existing = bestByCode.get(row.code);
    if (!existing || row.last_year > existing.lastYear) bestByCode.set(row.code, { driverId: row.driver_id, lastYear: row.last_year });
  }
  return new Map([...bestByCode].map(([code, v]) => [code, v.driverId]));
}

/** A driver's career — every race archive_results has this driver_id in, oldest first. A real
 * join now, not the Firestore version's flat driverIds array-contains workaround (Postgres never
 * needed that limitation in the first place). */
export const getArchiveRacesByDriver = unstable_cache(
  async (driverId: string): Promise<ArchiveRaceDoc[]> => {
    const { data: idRows } = await supabaseAdmin.from("archive_results").select("archive_race_id").eq("driver_id", driverId);
    const raceIds = (idRows ?? []).map((r) => r.archive_race_id as string);
    if (raceIds.length === 0) return [];
    const { data } = await supabaseAdmin.from("archive_races").select(ARCHIVE_RACE_SELECT).in("id", raceIds).order("year");
    return ((data ?? []) as ArchiveRaceRow[]).map(toArchiveRaceDoc);
  },
  ["get-archive-races-by-driver"],
  { revalidate: REVALIDATE_SECONDS, tags: [ARCHIVE_TAG] },
);

type ArchiveTeamRow = { team_id: string; name: string; first_year: number; last_year: number; race_count: number; drivers: string[] | null };

function toArchiveTeam(row: ArchiveTeamRow): ArchiveTeam {
  return { teamId: row.team_id, name: row.name, firstYear: row.first_year, lastYear: row.last_year, raceCount: row.race_count, drivers: row.drivers ?? [] };
}

export const getArchiveTeam = unstable_cache(
  async (teamId: string): Promise<ArchiveTeam | null> => {
    const { data } = await supabaseAdmin.from("archive_teams").select("*").eq("team_id", teamId).maybeSingle();
    return data ? toArchiveTeam(data as ArchiveTeamRow) : null;
  },
  ["get-archive-team"],
  { revalidate: REVALIDATE_SECONDS, tags: [ARCHIVE_TAG] },
);

/** Every team who's been through pipeline/enrich_archive_entities.py — for the "browse by team"
 * landing grid, same shape/sort as getAllArchiveDrivers. */
export const getAllArchiveTeams = unstable_cache(
  async (): Promise<ArchiveTeam[]> => {
    const { data } = await supabaseAdmin.from("archive_teams").select("*");
    return ((data ?? []) as ArchiveTeamRow[]).map(toArchiveTeam).sort((a, b) => b.lastYear - a.lastYear);
  },
  ["get-all-archive-teams"],
  { revalidate: REVALIDATE_SECONDS, tags: [ARCHIVE_TAG] },
);

/** Each team's "home circuit" — not a real-world fact this app tracks anywhere (Ergast has no
 * team-headquarters field), so this is a derived proxy instead: whichever circuit that team has
 * actually raced at the most, computed from archive_results.team_id joined to its race's
 * circuit_name (not circuit_id — see getArchiveCircuitStats for why circuit_name is the
 * far-more-complete key to group by). */
export const getArchiveTeamHomeCircuits = unstable_cache(
  async (): Promise<Record<string, string>> => {
    const { data } = await supabaseAdmin
      .from("archive_results")
      .select("team_id, archive_races(circuit_name)")
      .not("team_id", "is", null);

    const counts: Record<string, Record<string, number>> = {};
    // A to-one embed (archive_results -> its one parent archive_races) - PostgREST returns a
    // single object for this direction, not an array, but the untyped client can't verify that
    // statically without generated schema types, hence the through-unknown cast.
    const rows = (data ?? []) as unknown as { team_id: string; archive_races: { circuit_name: string | null } | null }[];
    for (const row of rows) {
      const circuitName = row.archive_races?.circuit_name;
      if (!circuitName) continue;
      const byCircuit = (counts[row.team_id] ??= {});
      byCircuit[circuitName] = (byCircuit[circuitName] ?? 0) + 1;
    }

    const result: Record<string, string> = {};
    for (const [teamId, byCircuit] of Object.entries(counts)) {
      const [topCircuitName] = Object.entries(byCircuit).sort((a, b) => b[1] - a[1])[0];
      result[teamId] = topCircuitName;
    }
    return result;
  },
  ["get-archive-team-home-circuits"],
  { revalidate: REVALIDATE_SECONDS, tags: [ARCHIVE_TAG] },
);

/** A team's history — every race archive_results has this team_id in, oldest first. Deduplicated
 * in JS (one race can have 2+ of this team's drivers, i.e. 2+ matching result rows) rather than a
 * SQL DISTINCT, which the query builder doesn't expose directly for this shape. */
export const getArchiveRacesByTeam = unstable_cache(
  async (teamId: string): Promise<ArchiveRaceDoc[]> => {
    const { data: idRows } = await supabaseAdmin.from("archive_results").select("archive_race_id").eq("team_id", teamId);
    const raceIds = [...new Set((idRows ?? []).map((r) => r.archive_race_id as string))];
    if (raceIds.length === 0) return [];
    const { data } = await supabaseAdmin.from("archive_races").select(ARCHIVE_RACE_SELECT).in("id", raceIds).order("year");
    return ((data ?? []) as ArchiveRaceRow[]).map(toArchiveRaceDoc);
  },
  ["get-archive-races-by-team"],
  { revalidate: REVALIDATE_SECONDS, tags: [ARCHIVE_TAG] },
);

/** Lap-by-lap timing, read on demand (LapChart's "Show lap chart" click, via
 * /api/archive/laps) rather than as part of getArchiveRace — a separate table, not a field on the
 * race row, specifically so this stays a separate, optional read (see
 * pipeline/enrich_archive_laps.py's module docstring for why it's split out: ~1,300 rows for a
 * single race vs. a few dozen for everything else). Empty array, not an error, for any race
 * that's `!lapsBackfilled` or predates 1996 (Ergast has no lap data before then). */
export const getArchiveRaceLaps = unstable_cache(
  async (year: number, round: number): Promise<ArchiveLapEntry[]> => {
    const { data: race } = await supabaseAdmin.from("archive_races").select("id").eq("year", year).eq("round", round).maybeSingle();
    if (!race) return [];
    const { data } = await supabaseAdmin
      .from("archive_laps")
      .select("lap_number, driver_id, position, time")
      .eq("archive_race_id", race.id)
      .order("lap_number");

    const byLap = new Map<number, ArchiveLapTiming[]>();
    for (const row of (data ?? []) as { lap_number: number; driver_id: string; position: number | null; time: string | null }[]) {
      const timings = byLap.get(row.lap_number) ?? [];
      timings.push({ driverId: row.driver_id, time: row.time, position: row.position });
      byLap.set(row.lap_number, timings);
    }
    return [...byLap.entries()].map(([lap, timings]) => ({ lap, timings })).sort((a, b) => a.lap - b.lap);
  },
  ["get-archive-race-laps"],
  { revalidate: REVALIDATE_SECONDS, tags: [ARCHIVE_TAG] },
);
