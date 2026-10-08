import { HomeShell } from "@/components/home/HomeShell";
import { resolveCurrentCircuitToArchiveId } from "@/lib/circuitSlug";
import { trackShortForm } from "@/lib/format";
import type { RaceDoc } from "@/lib/types/race";
import { getPersonalHomeData, type HomeData, type LandingSeason, type PublicHomeData } from "@/lib/homeData";
import { buildFacts, buildPredictionInsight, buildSeasonRecap, computeSeasonStandings, getRecentCircuitPhotos, getTrackHistory } from "@/lib/personalization";
import { getAllArchiveCircuits } from "@/lib/supabase/archive";
import { getCalendarEntriesByYear, getCalendarEntry, type WeatherForecast } from "@/lib/supabase/calendar";
import { getAllCurrentDrivers } from "@/lib/supabase/media";
import { getNextUpcomingRace, getRacesByYear } from "@/lib/supabase/races";
import { getSession } from "@/lib/session/getSession";
import { safeRead, safeReadTracked } from "@/lib/safeRead";
import { PageContainer } from "@/components/ui/PageContainer";
import { RefreshAlert } from "@/components/ui/RefreshAlert";
import { getCurrentSeason } from "@/lib/currentSeason";

// Reading the session cookie makes this route inherently dynamic (no route-level `revalidate`
// possible), but the underlying Postgres reads are still cached via `unstable_cache` in
// lib/supabase/races.ts (`revalidate: false`, busted by the pipeline's own `trigger_revalidation`
// the moment it actually pushes new data - not a fixed timer), so every visit — signed in or not —
// doesn't hit Postgres every time.

/** The landing page's season summary (LandingSeason): the top five and the most recent podium. */
function landingSeason(races: RaceDoc[], standings: { drivers: { driver: string; driverName: string; team: string; points: number; wins: number }[] }): LandingSeason {
  const completed = races.filter((r) => r.status === "completed" && r.results?.length).sort((a, b) => b.round - a.round);
  const last = completed[0];
  return {
    roundsCompleted: completed.length,
    totalRounds: races.length,
    top5: standings.drivers.slice(0, 5).map(({ driver, driverName, team, points, wins }) => ({ driver, driverName, team, points, wins })),
    lastRace: last
      ? {
          name: last.name,
          year: last.year,
          round: last.round,
          podium: [...last.results!]
            .filter((r) => r.finishPosition <= 3 && r.status !== "dnf")
            .sort((a, b) => a.finishPosition - b.finishPosition)
            .map(({ driver, driverName, team, finishGapSec }) => ({ driver, driverName, team, finishGapSec })),
        }
      : null,
  };
}

export default async function HomePage() {
  const session = await getSession();
  // The season from the calendar, not the wall clock (audit R-22): on 1 January it stays on the
  // finished season until the next calendar is synced.
  const year = await getCurrentSeason();

  // Public data: real regardless of auth state — the redesigned signed-out hero needs the exact
  // same upcoming-race context the signed-in one does, not a stripped-down version of it. No
  // listPublicGroups() here anymore - the logged-out homepage no longer has a group-discovery
  // section (joining a group needs an account anyway), and the signed-in one gets its own groups
  // from getPersonalHomeData below, not this fetch.
  //
  // Every read degrades on its own (audit FEAT-06: one failed read used to fail the whole page): a
  // failure gives that read's empty fallback, the sections built from it render empty, and the
  // page says some of it couldn't be loaded, with Try again.
  const publicReads = await Promise.all([
    safeReadTracked(() => getNextUpcomingRace(year), null),
    safeReadTracked(() => getRacesByYear(year), []),
    safeReadTracked(() => getAllArchiveCircuits(), []),
    safeReadTracked(() => getAllCurrentDrivers(), []),
    safeReadTracked(() => getCalendarEntriesByYear(year), []),
  ]);
  const [nextRace, races, archiveCircuits, currentDrivers, calendarEntries] = [
    publicReads[0].data,
    publicReads[1].data,
    publicReads[2].data,
    publicReads[3].data,
    publicReads[4].data,
  ] as const;

  // Real per-round weather (calendar's own field, only ever populated for a round still ahead of
  // "now" - see sync_calendar.py's own comment on why a forecast for an already-run race is
  // meaningless) - keyed once here, same "resolve every round up front, not per card" pattern
  // circuitImageByRound already uses.
  const weatherByRound: Record<number, WeatherForecast | null> = {};
  // The full season's real session schedule, keyed by round - not just nextRace's (that's what
  // `calendarEntry` below still is, for the hero's own RaceReadiness) - so SeasonStrip's featured
  // panel can show a real FP1/FP2/FP3/Q/R (or sprint) schedule for ANY round the navigator selects,
  // not only "this weekend"'s.
  const calendarByRound: Record<number, (typeof calendarEntries)[number] | undefined> = {};
  for (const entry of calendarEntries) {
    weatherByRound[entry.round] = entry.weatherForecast;
    calendarByRound[entry.round] = entry;
  }

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
  //
  // The personal read falls back to null on failure: HomeShell then fetches it again from the
  // browser (its own refetch for a signed-in visitor without personal data) and shows an inline
  // error with Try again if that fails too, so it is not part of this page's partial-data notice.
  const [calendarEntryRead, trackHistoryRead, recentPhotosRead, standingsRead, personalData] = await Promise.all([
    safeReadTracked(() => (nextRace ? getCalendarEntry(nextRace.year, nextRace.round) : Promise.resolve(null)), null),
    safeReadTracked(() => (resolvedCircuitId ? getTrackHistory(resolvedCircuitId) : Promise.resolve(null)), null),
    safeReadTracked(() => getRecentCircuitPhotos(resolvedCircuitId, nextRace?.circuit ?? null, year), []),
    safeReadTracked(() => computeSeasonStandings(year), { drivers: [], teams: [], poleCounts: {} }),
    session.uid ? safeRead(() => getPersonalHomeData(session.uid!, year, nextRace, races), null) : Promise.resolve(null),
  ]);
  const calendarEntry = calendarEntryRead.data;
  const trackHistory = trackHistoryRead.data;
  const recentPhotos = recentPhotosRead.data;
  const standings = standingsRead.data;

  // Track Intelligence, array-based: every favorite with real appearances at this circuit, not
  // just the primary - a second pass once personalData's favorite arrays are known (getTrackHistory
  // itself is cheap/cached per driver-circuit pair, see its own comment on unstable_cache).
  const trackHistoryWithFavorites =
    resolvedCircuitId && (personalData?.favoriteDrivers.length || personalData?.favoriteTeams.length)
      ? await safeRead(
          () =>
            getTrackHistory(resolvedCircuitId, {
              favoriteDriverIds: personalData?.favoriteDrivers.map((d) => d.driverId),
              favoriteTeamIds: personalData?.favoriteTeams.map((t) => t.teamId),
            }),
          trackHistory,
        )
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
    predictionInsight = await safeRead(
      () =>
        buildPredictionInsight(
          latestPrediction.predictedWinner,
          predictionRace ? trackShortForm(predictionRace.circuit) : "this circuit",
          predictionCircuitId,
          standings,
          latestPrediction.modelWinner,
        ),
      null,
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

  const publicData: PublicHomeData = {
    year,
    nextRace,
    races,
    calendarEntry,
    backdropPhotos,
    facts,
    trackHistory: trackHistoryWithFavorites,
    seasonRecap,
    circuitImageByRound,
    calendarByRound,
    weatherByRound,
    currentDrivers,
    predictionInsight,
  };

  const partial = [...publicReads, calendarEntryRead, trackHistoryRead, recentPhotosRead, standingsRead].some((read) => read.failed);

  // A signed-out visitor is sent only what the landing page renders (audit R-26). The rest of
  // publicData feeds the signed-in home; serialised into every anonymous visit it made the page
  // ~575 KB. Signing in refreshes the page (AuthDialog's router.refresh()), which brings the rest.
  const homeData: HomeData = session.uid
    ? { scope: "full", ...publicData }
    : { scope: "landing", year, nextRace, calendarEntry, backdropPhotos, facts, trackHistory: trackHistoryWithFavorites, season: landingSeason(races, standings) };

  return (
    <>
      {partial && (
        <PageContainer className="pt-6">
          <RefreshAlert />
        </PageContainer>
      )}
      <HomeShell publicData={homeData} initialPersonalData={personalData} serverAuthed={!!session.uid} />
    </>
  );
}
