import { HomeShell } from "@/components/home/HomeShell";
import { OnboardingTour } from "@/components/home/OnboardingTour";
import { resolveCurrentCircuitToArchiveId } from "@/lib/circuitSlug";
import { getPersonalHomeData } from "@/lib/homeData";
import { buildFacts, buildSeasonRecap, computeSeasonStandings, getRecentCircuitPhotos, getTrackHistory } from "@/lib/personalization";
import { getAllArchiveCircuits } from "@/lib/supabase/archive";
import { getCalendarEntry } from "@/lib/supabase/calendar";
import { getNextUpcomingRace, getRacesByYear } from "@/lib/supabase/races";
import { getSession } from "@/lib/session/getSession";

// Reading the session cookie makes this route inherently dynamic (no route-level `revalidate`
// possible), but the underlying Postgres reads are still cached via `unstable_cache` in
// lib/supabase/races.ts (`revalidate: false`, busted by the pipeline's own `trigger_revalidation`
// the moment it actually pushes new data - not a fixed timer), so every visit — signed in or not —
// doesn't hit Postgres every time.

export default async function HomePage() {
  const session = await getSession();
  const year = new Date().getFullYear();

  // Public data: real regardless of auth state — the redesigned signed-out hero needs the exact
  // same upcoming-race context the signed-in one does, not a stripped-down version of it. No
  // listPublicGroups() here anymore - the logged-out homepage no longer has a group-discovery
  // section (joining a group needs an account anyway), and the signed-in one gets its own groups
  // from getPersonalHomeData below, not this fetch.
  const [nextRace, races, archiveCircuits] = await Promise.all([getNextUpcomingRace(year), getRacesByYear(year), getAllArchiveCircuits()]);

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
  const seasonRecap = buildSeasonRecap(races, standings, personalData?.favoriteDriver ?? null, personalData?.favoriteTeam ?? null);

  const backdropPhotos =
    recentPhotos.length > 0
      ? recentPhotos.map((p) => p.url)
      : trackHistory?.circuitImageUrls?.length
        ? trackHistory.circuitImageUrls
        : trackHistory?.circuitImageUrl
          ? [trackHistory.circuitImageUrl]
          : [];

  const publicData = { year, nextRace, races, calendarEntry, backdropPhotos, facts, trackHistory, seasonRecap };

  return (
    <>
      {personalData && <OnboardingTour initiallyOpen={!personalData.profile?.onboardingCompletedAt} />}
      <HomeShell publicData={publicData} initialPersonalData={personalData} serverAuthed={!!session.uid} />
    </>
  );
}
