import { unstable_cache } from "next/cache";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { queryWithRetry } from "@/lib/supabase/queryWithRetry";
import { parseTrackStory, type RaceTrackStory } from "@/lib/raceTrackStory";

// Throws on a query error so the failure is never cached: a brief outage must not pin "no story" on a race
// until the next cache bust. A story that exists but is malformed, or no row at all, is a real answer and is
// cached (as null) like any other.
const cachedStory = unstable_cache(
  async (raceId: string): Promise<RaceTrackStory | null> => {
    const { data, error } = await queryWithRetry(() =>
      supabaseAdmin.from("race_track_stories").select("story").eq("race_id", raceId).maybeSingle(),
    );
    if (error) throw new Error(`getRaceTrackStory(${raceId}): ${error.message}`);
    return data ? parseTrackStory(data.story) : null;
  },
  ["get-race-track-story-v1"],
  { revalidate: false, tags: ["races"] },
);

/** The race's real circuit and lead-change locations (race_track_stories), or null: no story yet, one in a
 * shape this app doesn't know, or no table at all (before its migration is applied). Never throws - the race
 * page draws the storyline's fallback route instead, as it always has. */
export async function getRaceTrackStory(raceId: string): Promise<RaceTrackStory | null> {
  try {
    return await cachedStory(raceId);
  } catch (e) {
    console.warn(e instanceof Error ? e.message : e);
    return null;
  }
}
