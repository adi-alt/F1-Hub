import { getRacesByYear } from "@/lib/supabase/races";
import { computeStandings } from "@/lib/standings";

/** No permission tier here (unlike users/models) — every signed-in user sees the same season
 * data, so this is just data assembly, not an authorization decision. */
export async function getSeasonPageData(year: number) {
  const races = await getRacesByYear(year);
  const standings = computeStandings(races);
  return { races, standings };
}
