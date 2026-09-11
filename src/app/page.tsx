import { HomeShell } from "@/components/home/HomeShell";
import { OnboardingTour } from "@/components/home/OnboardingTour";
import { resolveCurrentCircuitToArchiveId } from "@/lib/circuitSlug";
import { trackShortForm } from "@/lib/format";
import { getPersonalHomeData } from "@/lib/homeData";
import { buildFacts, buildPredictionInsight, buildSeasonRecap, computeSeasonStandings, getRecentCircuitPhotos, getTrackHistory } from "@/lib/personalization";
import { getAllArchiveCircuits } from "@/lib/supabase/archive";
import { getCalendarEntriesByYear, getCalendarEntry, type WeatherForecast } from "@/lib/supabase/calendar";
import { getAllCurrentDrivers } from "@/lib/supabase/media";
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
  const [nextRace, races, archiveCircuits, currentDrivers, calendarEntries] = await Promise.all([
    getNextUpcomingRace(year),
    getRacesByYear(year),
    getAllArchiveCircuits(),
    getAllCurrentDrivers(),
    getCalendarEntriesByYear(year),
  ]);

  // Real per-round weather (calendar's own field, only ever populated for a round still ahead of
  // "now" - see sync_calendar.py's own comment on why a forecast for an already-run race is
  // meaningless) - keyed once here, same "resolve every round up front, not per card" pattern
  // circuitImageByRound already uses.
  const weatherByRound: Record<number, WeatherForecast | null> = {};
  for (const entry of calendarEntries) weatherByRound[entry.round] = entry.weatherForecast;

  const circuitLocalities = new Map(archiveCircuits.filter((c) => c.locality).map((c) => [c.circuitId, c.locality as string]));
  const circuitIdsByName = new Map(archiveCircuits.filter((c) => c.name).map((c) => [c.name!.trim().toLowerCase(), c.circuitId]));
  const archiveImageByCircuitId = new Map(archiveCircuits.map((c) => [c.circuitId, c.imageUrl]));
  const resolvedCircuitId = nextRace ? resolveCurrentCircuitToArchiveId(nextRace.circuit, circuitLocalities, circuitIdsByName) : null;

  // Every round's circuit resolved once, server-side, here - not per-card in SeasonStrip (which
  // renders one card per round from this one shared map). Real photo (race.photoUrl) always wins
  // in SeasonStrip itself; this is purely the archive-image fallback tier for rounds that don't
  // have one yet. Circuits truly missing from archive_circuits (Miami/Vegas/Qatar, pre-race - see
  // circuitSlug.ts's own comment) simply resolve to null here and fall through to SeasonStrip's
  // abstract CSS treatment - an honest, verified gap, not a guess.
  const circuitImageByRound: Record<number, string | null> = {};
  for (const race of races) {
    const resolved = resolveCurrentCircuitToArchiveId(race.circuit, circuitLocalities, circuitIdsByName);
    circuitImageByRound[race.round] = (resolved && archiveImageByCircuitId.get(resolved)) || null;
  }

  // getPersonalHomeData (below) already resolves the full favorite-card arrays for the signed-in
  // case — fetched once here, reused for buildFacts/buildSeasonRecap/getTrackHistory, rather than
  // a second favorites lookup.
  const [calendarEntry, trackHistory, recentPhotos, standings, personalData] = await Promise.all([
    nextRace ? getCalendarEntry(nextRace.year, nextRace.round) : null,
    resolvedCircuitId ? getTrackHistory(resolvedCircuitId) : null,
    getRecentCircuitPhotos(resolvedCircuitId, nextRace?.circuit ?? null, year),
    computeSeasonStandings(year),
    session.uid ? getPersonalHomeData(session.uid, year, nextRace, races) : Promise.resolve(null),
  ]);

  // Track Intelligence, array-based: every favorite with real appearances at this circuit, not
  // just the primary - a second pass once personalData's favorite arrays are known (getTrackHistory
  // itself is cheap/cached per driver-circuit pair, see its own comment on unstable_cache).
  const trackHistoryWithFavorites =
    resolvedCircuitId && (personalData?.favoriteDrivers.length || personalData?.favoriteTeams.length)
      ? await getTrackHistory(resolvedCircuitId, {
          favoriteDriverIds: personalData?.favoriteDrivers.map((d) => d.driverId),
          favoriteTeamIds: personalData?.favoriteTeams.map((t) => t.teamId),
        })
      : trackHistory;

  // Prediction Intelligence's "why this pick" grounding - real archive circuit history + season
  // standing for the SPECIFIC driver the user actually predicted (not their favorite - a pick can
  // easily be for someone else entirely), plus how that pick compares to the model's own top
  // choice (already resolved onto latestPrediction.modelWinner) and the championship leader.
  // Lives on publicData (not personalData) matching facts/seasonRecap's own precedent just below -
  // both are page.tsx-level computations combining public standings with a personal input.
  let predictionInsight = null;
  if (personalData?.latestPrediction) {
    const latestPrediction = personalData.latestPrediction;
    const predictionRace = races.find((r) => r.id === latestPrediction.raceId);
    const predictionCircuitId = predictionRace
      ? resolveCurrentCircuitToArchiveId(predictionRace.circuit, circuitLocalities, circuitIdsByName)
      : null;
    predictionInsight = await buildPredictionInsight(
      latestPrediction.predictedWinner,
      predictionRace ? trackShortForm(predictionRace.circuit) : "this circuit",
      predictionCircuitId,
      standings,
      latestPrediction.modelWinner,
    );
  }

  const facts = buildFacts(year, standings, personalData?.favoriteDriver ?? null, personalData?.favoriteTeam ?? null, trackHistoryWithFavorites);
  const seasonRecap = buildSeasonRecap(
    races,
    standings,
    personalData?.favoriteDriver ?? null,
    personalData?.favoriteTeam ?? null,
    personalData?.favoriteDrivers ?? [],
    personalData?.favoriteTeams ?? [],
  );

  const backdropPhotos =
    recentPhotos.length > 0
      ? recentPhotos.map((p) => p.url)
      : trackHistory?.circuitImageUrls?.length
        ? trackHistory.circuitImageUrls
        : trackHistory?.circuitImageUrl
          ? [trackHistory.circuitImageUrl]
          : [];

  const publicData = {
    year,
    nextRace,
    races,
    calendarEntry,
    backdropPhotos,
    facts,
    trackHistory: trackHistoryWithFavorites,
    seasonRecap,
    circuitImageByRound,
    weatherByRound,
    currentDrivers,
    predictionInsight,
  };

  return (
    <>
      {personalData && <OnboardingTour initiallyOpen={!personalData.profile?.onboardingCompletedAt} />}
      <HomeShell publicData={publicData} initialPersonalData={personalData} serverAuthed={!!session.uid} />
    </>
  );
}
