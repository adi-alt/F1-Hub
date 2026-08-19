import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import type {
  PolePrediction,
  RaceDoc,
  RaceInputEntry,
  RacePrediction,
  RaceResultEntry,
  RaceSimulation,
  SessionWeather,
  TireStint,
} from "@/lib/types/race";

// Data only changes when the pipeline runs (GitHub Actions, every few hours) — cache reads for a
// few minutes rather than hitting Postgres on every request. This lives at the data layer (not
// route-level revalidate) because query-param routes read searchParams, which Next always treats
// as dynamic — caching here is what keeps those pages fast regardless.
const REVALIDATE_SECONDS = 300;

// One row per table, exactly as supabase/schema.sql defines it — nothing optional-chained
// defensively; if this shape drifts from the schema, that's a real bug to see at the type level.
type RaceRow = {
  id: string;
  year: number;
  round: number;
  name: string;
  circuit: string;
  status: "upcoming" | "completed" | "scheduled";
  race_date: string | null;
  pole_sitter: string | null;
  pole_time_sec: number | null;
  weather: SessionWeather | null;
  prediction: RacePrediction | null;
  pole_prediction: PolePrediction | null;
  simulation: RaceSimulation | null;
  updated_at: string;
  race_results: {
    driver: string;
    driver_name: string;
    team: string;
    grid: number | null;
    finish_position: number;
    finish_gap_sec: number | null;
    status: RaceResultEntry["status"];
    fastest_lap_sec: number | null;
    points: number;
  }[];
  race_inputs: {
    driver: string;
    driver_name: string;
    team: string;
    grid: number;
    qualifying_gap_sec: number | null;
  }[];
  tire_stints: { driver: string; stint_number: number; compound: string; lap_count: number }[];
};

// One nested query (PostgREST embeds via the tables' own foreign keys) instead of four - this
// replaces both the Firestore doc's own translation step (toRaceDoc) and the three separate reads
// race_results/race_inputs/tire_stints would otherwise need.
const RACE_SELECT = "*, race_results(*), race_inputs(*), tire_stints(*)";

function toRaceDoc(row: RaceRow): RaceDoc {
  const inputs: RaceInputEntry[] | undefined = row.race_inputs.length
    ? row.race_inputs.map((i) => ({
        driver: i.driver,
        driverName: i.driver_name,
        team: i.team,
        grid: i.grid,
        qualifyingGapSec: i.qualifying_gap_sec,
      }))
    : undefined;

  const results: RaceResultEntry[] | undefined = row.race_results.length
    ? row.race_results.map((r) => ({
        driver: r.driver,
        driverName: r.driver_name,
        team: r.team,
        grid: r.grid,
        finishPosition: r.finish_position,
        finishGapSec: r.finish_gap_sec,
        status: r.status,
        fastestLapSec: r.fastest_lap_sec,
        points: r.points,
      }))
    : undefined;

  const tireStints: TireStint[] | undefined = row.tire_stints.length
    ? row.tire_stints.map((t) => ({
        driver: t.driver,
        stintNumber: t.stint_number,
        compound: t.compound,
        lapCount: t.lap_count,
      }))
    : undefined;

  return {
    id: row.id,
    year: row.year,
    round: row.round,
    name: row.name,
    circuit: row.circuit,
    status: row.status,
    updatedAt: row.updated_at,
    results,
    poleSitter: row.pole_sitter ?? undefined,
    poleTimeSec: row.pole_time_sec ?? undefined,
    inputs,
    weather: row.weather ?? undefined,
    tireStints,
    prediction: row.prediction ?? undefined,
    polePrediction: row.pole_prediction ?? undefined,
    simulation: row.simulation ?? undefined,
  };
}

type CalendarRow = { id: string; year: number; round: number; name: string | null; circuit: string | null; race_date: string | null };

/** A minimal, non-clickable stand-in for a round `races` has no row for yet — there's nothing to
 * show but the name and date, since no session has run. */
function toCalendarPlaceholder(row: CalendarRow): RaceDoc {
  return {
    id: row.id,
    year: row.year,
    round: row.round,
    name: row.name ?? "",
    circuit: row.circuit ?? "",
    status: "scheduled",
    updatedAt: row.race_date ?? "",
    raceDate: row.race_date ?? undefined,
  };
}

/** Fills in any round `races` has no row for yet with a `calendar` placeholder, so a season's
 * back half isn't simply invisible before its first session runs. `races` entries always win —
 * `calendar` is a fallback, never an override. */
async function withCalendarPlaceholders(year: number, races: RaceDoc[]): Promise<RaceDoc[]> {
  const knownRounds = new Set(races.map((r) => r.round));
  const { data } = await supabaseAdmin.from("calendar").select("*").eq("year", year);
  const placeholders = ((data ?? []) as CalendarRow[])
    .filter((r) => !knownRounds.has(r.round))
    .map(toCalendarPlaceholder);
  return [...races, ...placeholders].sort((a, b) => a.round - b.round);
}

/** A single race by (year, round) — round, not a slug, is the stable key a URL can carry. */
export const getRace = unstable_cache(
  async (year: number, round: number): Promise<RaceDoc | null> => {
    const { data } = await supabaseAdmin.from("races").select(RACE_SELECT).eq("year", year).eq("round", round).maybeSingle();
    return data ? toRaceDoc(data as RaceRow) : null;
  },
  ["get-race"],
  { revalidate: REVALIDATE_SECONDS },
);

/** A season's races in calendar order, including rounds `races` has no row for yet (see
 * `withCalendarPlaceholders`) — otherwise the back half of an in-progress season is invisible. */
export const getRacesByYear = unstable_cache(
  async (year: number): Promise<RaceDoc[]> => {
    const { data } = await supabaseAdmin.from("races").select(RACE_SELECT).eq("year", year).order("round");
    const races = ((data ?? []) as RaceRow[]).map(toRaceDoc);
    return withCalendarPlaceholders(year, races);
  },
  ["get-races-by-year"],
  { revalidate: REVALIDATE_SECONDS },
);

/**
 * A circuit's full history across seasons, oldest first. Queries FastF1's `circuit` field
 * (e.g. "Budapest") rather than a derived slug — event names can and do change across eras for
 * the same physical track (e.g. "Brazilian Grand Prix" -> "São Paulo Grand Prix"), but the city
 * hosting it doesn't.
 */
export const getRacesByCircuit = unstable_cache(
  async (circuit: string): Promise<RaceDoc[]> => {
    const { data } = await supabaseAdmin.from("races").select(RACE_SELECT).eq("circuit", circuit).order("year");
    return ((data ?? []) as RaceRow[]).map(toRaceDoc);
  },
  ["get-races-by-circuit"],
  { revalidate: REVALIDATE_SECONDS },
);

/** The next race on the calendar that isn't marked completed yet, for the home page's hero card —
 * built on the same merged (`races` + `calendar` placeholder) list `getRacesByYear` returns, so
 * this doesn't go blank just because the immediate next round hasn't had a session yet. */
export const getNextUpcomingRace = unstable_cache(
  async (year: number): Promise<RaceDoc | null> => {
    const races = await getRacesByYear(year);
    return races.find((r) => r.status !== "completed") ?? null;
  },
  ["get-next-upcoming-race"],
  { revalidate: REVALIDATE_SECONDS },
);

/** The current grid — driver/team pairs from the most recent race with real results or a real
 * qualifying-based grid, so this never needs a hardcoded roster that goes stale the moment a
 * seat changes. Shared by the personalization page and the signup form. */
export async function getCurrentEntrants(year: number): Promise<{ driver: string; driverName: string; team: string }[]> {
  const races = await getRacesByYear(year);
  const withEntrants = [...races].reverse().find((r) => (r.results?.length ?? 0) > 0 || (r.inputs?.length ?? 0) > 0);
  if (!withEntrants) return [];
  return withEntrants.results?.length
    ? withEntrants.results.map((r) => ({ driver: r.driver, driverName: r.driverName, team: r.team }))
    : (withEntrants.inputs ?? []).map((i) => ({ driver: i.driver, driverName: i.driverName, team: i.team }));
}
