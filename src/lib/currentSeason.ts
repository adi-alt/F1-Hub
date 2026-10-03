import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";

type CalendarEvent = { year: number; race_date: string | null; status: string | null };

/**
 * The season the site is on (audit R-22), from the calendar rather than the wall clock: the
 * earliest year with a race still to come, or, once every race has run (December, before next
 * year's calendar is published), the latest year on the calendar. So the nav doesn't jump to an
 * empty new season on 1 January, and moves on by itself once the next calendar is synced.
 * `today` is a UTC date ("YYYY-MM-DD"). Cancelled events don't count. Null with no calendar.
 */
export function currentSeasonFrom(events: readonly CalendarEvent[], today: string): number | null {
  const live = events.filter((e) => e.status !== "cancelled");
  const upcoming = live.filter((e) => e.race_date !== null && e.race_date.slice(0, 10) >= today).map((e) => e.year);
  if (upcoming.length) return Math.min(...upcoming);
  return live.length ? Math.max(...live.map((e) => e.year)) : null;
}

/** The current season for the nav, the footer and the 404 page. Cached for an hour; falls back to
 * the UTC year if the calendar can't be read, so a database problem never breaks the layout. */
export const getCurrentSeason = unstable_cache(
  async (): Promise<number> => {
    const fallback = new Date().getUTCFullYear();
    try {
      const { data, error } = await supabaseAdmin.from("calendar").select("year, race_date, status");
      if (error) throw error;
      return currentSeasonFrom((data ?? []) as CalendarEvent[], new Date().toISOString().slice(0, 10)) ?? fallback;
    } catch (err) {
      console.error("getCurrentSeason: calendar read failed, using the UTC year:", err);
      return fallback;
    }
  },
  ["current-season"],
  { revalidate: 3600 },
);
