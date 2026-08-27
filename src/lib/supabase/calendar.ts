import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

export type CalendarSession = { label: string; date: string };

// See pipeline/weather_forecast.py's own docstring: a real 5-day-out forecast when
// WEATHER_API_KEY is set and the race is close enough, else a labeled historical fallback -
// never silently overwritten once fetched, so this is a snapshot of what was knowable then.
export type WeatherForecast = {
  source: "openweathermap" | "historical_fallback";
  rainProbability: number;
  airTempC: number;
  fetchedAt: string;
};

export type CalendarEntry = {
  id: string;
  year: number;
  round: number;
  name: string | null;
  circuit: string | null;
  eventFormat: string | null; // "conventional" | "sprint_qualifying" | ...
  sessions: CalendarSession[];
  weatherForecast: WeatherForecast | null;
  raceDate: string | null;
};

const REVALIDATE_SECONDS = 300;

type CalendarRow = {
  id: string;
  year: number;
  round: number;
  name: string | null;
  circuit: string | null;
  event_format: string | null;
  sessions: CalendarSession[] | null;
  weather_forecast: WeatherForecast | null;
  race_date: string | null;
};

function fromRow(row: CalendarRow): CalendarEntry {
  return {
    id: row.id,
    year: row.year,
    round: row.round,
    name: row.name,
    circuit: row.circuit,
    eventFormat: row.event_format,
    sessions: row.sessions ?? [],
    weatherForecast: row.weather_forecast,
    raceDate: row.race_date,
  };
}

/** The full session schedule (practice/qualifying/sprint/race, with real datetimes) + weather
 * forecast for one race weekend — sync_calendar.py's own domain, richer than what `races` itself
 * needs (races.ts only cares about results once a session has actually run). */
export const getCalendarEntry = unstable_cache(
  async (year: number, round: number): Promise<CalendarEntry | null> => {
    const { data } = await supabaseAdmin.from("calendar").select("*").eq("year", year).eq("round", round).maybeSingle();
    return data ? fromRow(data as CalendarRow) : null;
  },
  ["get-calendar-entry"],
  { revalidate: REVALIDATE_SECONDS, tags: ["calendar"] },
);

/** Every round's full session schedule for a season in one query — the per-year counterpart to
 * `getCalendarEntry`, for the season page's calendar heatmap (one query covers every cell instead
 * of one round at a time). */
export const getCalendarEntriesByYear = unstable_cache(
  async (year: number): Promise<CalendarEntry[]> => {
    // See getRacesByYear's own comment - a swallowed error here reads as "empty calendar" and
    // gets cached as such for REVALIDATE_SECONDS, instead of surfacing and letting the next
    // request try again fresh.
    const { data, error } = await supabaseAdmin.from("calendar").select("*").eq("year", year).order("round");
    if (error) throw new Error(`getCalendarEntriesByYear(${year}): ${error.message}`);
    return ((data ?? []) as CalendarRow[]).map(fromRow);
  },
  ["get-calendar-entries-by-year"],
  { revalidate: REVALIDATE_SECONDS, tags: ["calendar"] },
);
