import { HomeShell } from "@/components/home/HomeShell";
import { OnboardingTour } from "@/components/home/OnboardingTour";
import { resolveCurrentCircuitToArchiveId } from "@/lib/circuitSlug";
import { getPersonalHomeData } from "@/lib/homeData";
import { buildFacts, buildSeasonRecap, computeSeasonStandings, getRecentCircuitPhotos, getTrackHistory } from "@/lib/personalization";
import { getAllArchiveCircuits } from "@/lib/supabase/archive";
import { getCalendarEntry } from "@/lib/supabase/calendar";
import { listPublicGroups } from "@/lib/supabase/groups";
import { getNextUpcomingRace, getRacesByYear } from "@/lib/supabase/races";
import { getSession } from "@/lib/session/getSession";

// Reading the session cookie makes this route inherently dynamic (no route-level `revalidate`
// possible), but the underlying Postgres reads are still cached for 300s via `unstable_cache` in
// lib/supabase/races.ts, so every visit — signed in or not — doesn't hit Postgres every time.

// A homepage teaser, not the full Discover Groups experience — same reasoning DiscoverSection's
// own cap already documents.
const DISCOVER_GROUPS_LIMIT = 3;

export default async function HomePage() {
  const session = await getSession();
  const year = new Date().getFullYear();

  // Public data: real regardless of auth state — the redesigned signed-out hero needs the exact
  // same upcoming-race context the signed-in one does, not a stripped-down version of it.
  const [nextRace, races, archiveCircuits, publicGroups] = await Promise.all([
    getNextUpcomingRace(year),
    getRacesByYear(year),
    getAllArchiveCircuits(),
    listPublicGroups(),
  ]);

  const circuitLocalities = new Map(archiveCircuits.filter((c) => c.locality).map((c) => [c.circuitId, c.locality as string]));
  const circuitIdsByName = new Map(archiveCircuits.filter((c) => c.name).map((c) => [c.name!.trim().toLowerCase(), c.circuitId]));
  const resolvedCircuitId = nextRace ? resolveCurrentCircuitToArchiveId(nextRace.circuit, circuitLocalities, circuitIdsByName) : null;

  // getPersonalHomeData (below) already resolves favoriteDriver/favoriteTeam as full cards for
  // the signed-in case — fetched once here, reused for both the personal bundle and buildFacts,
  // rather than a second favorites lookup.
  const [calendarEntry, trackHistory, recentPhotos, standings, personalData] = await Promise.all([
    nextRace ? getCalendarEntry(nextRace.year, nextRace.round) : null,
    resolvedCircuitId ? getTrackHistory(resolvedCircuitId) : null,
    getRecentCircuitPhotos(resolvedCircuitId, nextRace?.circuit ?? null, year),
    computeSeasonStandings(year),
    session.uid ? getPersonalHomeData(session.uid, year, nextRace, races) : Promise.resolve(null),
  ]);

  const facts = buildFacts(year, standings, personalData?.favoriteDriver ?? null, personalData?.favoriteTeam ?? null, trackHistory);
  const seasonRecap = buildSeasonRecap(races, standings, personalData?.favoriteDriver ?? null);

  const backdropPhotos =
    recentPhotos.length > 0
      ? recentPhotos.map((p) => p.url)
      : trackHistory?.circuitImageUrls?.length
        ? trackHistory.circuitImageUrls
        : trackHistory?.circuitImageUrl
          ? [trackHistory.circuitImageUrl]
          : [];

  const publicData = { year, nextRace, races, calendarEntry, backdropPhotos, facts, trackHistory, seasonRecap };
  const discoverGroups = publicGroups.filter((g) => !g.isMember).slice(0, DISCOVER_GROUPS_LIMIT);

  return (
    <>
      {personalData && <OnboardingTour initiallyOpen={!personalData.profile?.onboardingCompletedAt} />}
      <HomeShell publicData={publicData} initialPersonalData={personalData} discoverGroups={discoverGroups} serverAuthed={!!session.uid} />
    </>
  );
}
