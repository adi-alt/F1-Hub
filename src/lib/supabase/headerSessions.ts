import { getCalendarEntriesByYear } from "@/lib/supabase/calendar";
import { upcomingSessions, type HeaderSession } from "@/lib/headerSchedule";

/** The next few sessions for the header's race-weekend status (Header.tsx), from the cached calendar. A failed read
 * only loses the status, never the page: it comes back empty. */
export async function getHeaderSessions(season: number): Promise<HeaderSession[]> {
  try {
    return upcomingSessions(await getCalendarEntriesByYear(season), Date.now());
  } catch (err) {
    console.error("getHeaderSessions: calendar read failed:", err);
    return [];
  }
}
