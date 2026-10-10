import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ArchiveRaceDashboard } from "@/app/archive/components/ArchiveRaceDashboard";
import { getAllArchiveCircuitsData, getArchiveCircuitData, getArchiveCircuitHistoryData, getArchiveSeasonData } from "@/app/archive/services/archive.service";
import { seasonStatus } from "@/app/season/_service/season.pure";
import { SeasonRaceDashboard } from "@/components/race/SeasonRaceDashboard";
import { RaceHeader } from "@/components/raceDetail/RaceHeader";
import { RaceKeyFact } from "@/components/race/RaceKeyFact";
import { getRaceTrackStory, getRaceTrackStoryByRound } from "@/lib/supabase/raceTrackStories";
import { getRaceLayout } from "@/lib/supabase/circuitLayouts";
import { RaceBannerStats } from "@/components/race/RaceBannerStats";
import { RaceMoreMenu } from "@/components/race/RaceMoreMenu";
import { RacePageHeader } from "@/components/race/RacePageHeader";
import { SignInGate } from "@/components/auth/SignInGate";
import { findArchiveCircuitByLocation, getArchiveRacesByCircuitId } from "@/lib/supabase/archive";
import { getCalendarEntry } from "@/lib/supabase/calendar";
import { getCurrentEntrants, getRace, getRacesByCircuit, getRacesByYear, getRaceSimulation } from "@/lib/supabase/races";
import { computeHighlights } from "@/lib/highlights";
import { buildCircuitTimeline } from "@/lib/circuitIntelligence";
import { computeAgeRecords } from "@/lib/circuitRecords";
import { getPersonalRaceContext } from "@/lib/personalRaceBriefing";
import { listRaceCommunities } from "@/lib/supabase/groupPredictions";
import { comparePolePrediction, comparePrediction } from "@/lib/predictionAccuracy";
import { archiveSeasonHref, slugifyRaceName } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";
import { getApprovedRacePhotos } from "@/lib/supabase/racePhotos";
import { getCurrentSeason } from "@/lib/currentSeason";

/** The one race-detail route, regardless of where the user came from (Season's calendar or an
 * Archive year) - "the race detail page must be identical regardless of where the user came
 * from." Query-parameterized (?year=&race=), not path segments, matching /archive?year=. Which
 * pipeline backs it follows the same seasonStatus split SeasonDetail's own data layer uses: the
 * live season (real prediction/pole/simulation data) vs. every other year (archive_races - richer
 * completed-race data, real pit-stops/qualifying/laps). */
// Reuses the same year/slug resolution the page itself does - getRacesByYear/getArchiveSeasonData
// are both cached (unstable_cache), so this doesn't cost a second real fetch, just a cache hit.
export async function generateMetadata({ searchParams }: { searchParams: Promise<{ year?: string; race?: string }> }): Promise<Metadata> {
  const { year: yearParam, race: raceParam } = await searchParams;
  const year = Number(yearParam);
  if (!yearParam || !raceParam || Number.isNaN(year)) return { title: "Race" };

  if (seasonStatus(year, await getCurrentSeason()) === "ongoing") {
    const match = (await getRacesByYear(year)).find((r) => slugifyRaceName(r.name) === raceParam);
    return match ? { title: `${match.name} ${year}` } : { title: "Race" };
  }
  const match = (await getArchiveSeasonData(year)).find((r) => slugifyRaceName(r.raceName) === raceParam);
  return match ? { title: `${match.raceName} ${year}` } : { title: "Race" };
}

export default async function RacePage({ searchParams }: { searchParams: Promise<{ year?: string; race?: string }> }) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="page-wide py-8">
        <SignInGate label="this race" />
      </div>
    );
  }

  const { year: yearParam, race: raceParam } = await searchParams;
  const year = Number(yearParam);
  const slug = raceParam ?? "";
  if (!yearParam || !raceParam || Number.isNaN(year)) notFound();

  if (seasonStatus(year, await getCurrentSeason()) === "ongoing") {
    // getRacesByYear also returns calendar placeholders for rounds with no real row yet (see its
    // own comment) - resolves slug -> round, and doubles as the fallback RaceDoc just below for a
    // round `getRace` itself has nothing for yet.
    const roundMatch = (await getRacesByYear(year)).find((r) => slugifyRaceName(r.name) === slug);
    if (!roundMatch) notFound();
    // `getRace` is the strict, real-`races`-row-only fetch - null whenever this round has no
    // session data yet, which used to 404 the whole page. `roundMatch` (above) already carries a
    // real calendar placeholder (`status: "scheduled"`, see toCalendarPlaceholder in races.ts) for
    // exactly this case - falling back to it instead is what makes an upcoming round's URL render
    // a real (if mostly empty) page instead of a 404 just because no session has run yet.
    const race = (await getRace(year, roundMatch.round)) ?? roundMatch;

    const highlights = computeHighlights(race);
    const accuracy = comparePrediction(race);
    const poleAccuracy = comparePolePrediction(race);

    // The live `races` table has no circuit_id (see findArchiveCircuitByLocation's own comment) -
    // an exact locality+country match against the archive's circuit list is the only real way to
    // find this venue's actual image/Wikipedia link. Null (no image shown), never a guess, for a
    // venue the archive hasn't reached yet.
    const [circuits, calendarEntry] = await Promise.all([
      getAllArchiveCircuitsData(),
      // The real per-session schedule (see RaceWeekendPanel) - `races` itself has no session dates
      // beyond whichever have already run, `calendar` is sync_calendar.py's own domain and always
      // has the full weekend's real datetimes, win or lose.
      getCalendarEntry(year, roundMatch.round),
    ]);
    const matchedCircuit = findArchiveCircuitByLocation(circuits, race.circuit, race.country);
    const raceSessionDate = calendarEntry?.sessions.find((s) => /race/i.test(s.label) && !/sprint/i.test(s.label))?.date ?? calendarEntry?.raceDate ?? null;

    // Only fetched for the one case that actually needs it - a real `upcoming` race (a genuine
    // `races` row exists, so a pick can actually be saved, see PickPanel's own comment) whose own
    // qualifying hasn't happened yet, so there's no race.inputs grid to pick from. `getCurrentEntrants`
    // is the same "most recent real grid" lookup the signup form already uses - not a new source.
    const fallbackEntrants = race.status === "upcoming" && !race.inputs?.length ? await getCurrentEntrants(year) : [];

    // This exact physical track's own real history - fetched for every race regardless of phase.
    // It used to be skipped for a completed race ("has its own full real analysis already, this
    // would be redundant") - true for Track Intelligence's own trend/weather panel (still gated to
    // !isCompleted below), but Grand Prix History and this circuit's all-time records are not
    // redundant with a single race's own result; a completed race's page is exactly where "how
    // does this result fit into history" belongs. Both real sources, same match `matchedCircuit`
    // above already resolved - archive_races is NOT pre-2018-only (confirmed live: it
    // comprehensively covers a circuit's full history, including years `races` also has), so
    // circuitIntelligence.ts's own merge dedupes by year rather than treating these as two
    // non-overlapping halves - see its own comment.
    const [liveRaces, archiveRaces] = await Promise.all([
      getRacesByCircuit(race.circuit),
      matchedCircuit ? getArchiveCircuitHistoryData(matchedCircuit.circuitId) : Promise.resolve([]),
    ]);
    const trackHistory = { liveRaces, archiveRaces };
    // Real ages, resolved server-side (needs Supabase - see circuitRecords.ts's own top comment
    // for why this can't live in the client-safe circuitIntelligence.ts module it builds on).
    const circuitTimeline = buildCircuitTimeline(liveRaces, archiveRaces);
    const [ageRecords, personalContext, raceCommunities, photos, trackStory, layout] = await Promise.all([
      computeAgeRecords(circuitTimeline),
      getPersonalRaceContext(session.uid, circuitTimeline, liveRaces),
      listRaceCommunities(race.id, session.uid),
      // Approved Wikimedia photos only (pipeline/race_photos.py, /admin/race-photos); none -> no section.
      getApprovedRacePhotos(race.id),
      // The real circuit and where the lead changed (pipeline/race_track_story.py); null -> fallback route.
      race.status === "completed" ? getRaceTrackStory(race.id) : Promise.resolve(null),
      // The track library's layout for this circuit and season, drawn when the race has no story of its own.
      getRaceLayout({ circuitId: matchedCircuit?.circuitId ?? null, circuitName: race.circuit, year: race.year, raceName: race.name }),
    ]);

    return (
      <div data-surface="frosted" className="page-wide py-8">
        <RacePageHeader
          year={race.year}
          round={race.round}
          name={race.name}
          circuit={race.circuit}
          country={race.country}
          raceStart={raceSessionDate}
          state={race.status === "completed" ? (race.resultsSource === "openf1_preliminary" ? "preliminary" : "final") : "upcoming"}
          // The race's own photos only: no circuit photo stands in for a race that has none.
          photoUrl={race.photoUrls?.[0] ?? race.photoUrl ?? null}
          keyFact={<RaceKeyFact sessions={calendarEntry?.sessions ?? []} results={race.status === "completed" ? race.results : null} />}
          stats={<RaceBannerStats race={race} highlights={highlights} forecast={calendarEntry?.weatherForecast} />}
          actions={
            <RaceMoreMenu
              race={race}
              completed={race.status === "completed" && !!race.results}
              accuracy={accuracy}
              poleAccuracy={poleAccuracy}
              personal={personalContext}
              fallbackEntrants={fallbackEntrants}
              raceSessionDate={raceSessionDate}
              sessions={calendarEntry?.sessions ?? []}
            />
          }
        />
        <div className="mt-12">
          <SeasonRaceDashboard
            race={race}
            calendarEntry={calendarEntry}
            trackHistory={trackHistory}
            circuitTimeline={circuitTimeline}
            raceCommunities={raceCommunities}
            ageRecords={ageRecords}
            photos={photos}
            trackStory={trackStory}
            layout={layout}
          />
        </div>
      </div>
    );
  }

  // getArchiveSeasonData already embeds every race's full results/qualifying/pit-stops - finding
  // the match here is one fetch, not two.
  const races = await getArchiveSeasonData(year);
  const race = races.find((r) => slugifyRaceName(r.raceName) === slug);
  if (!race) notFound();
  const [circuit, simulation, circuitLiveRaces, circuitArchiveRaces] = await Promise.all([
    race.circuitId ? getArchiveCircuitData(race.circuitId) : Promise.resolve(null),
    // Real Monte Carlo data for this exact race, sourced from `races` (confirmed live: populated
    // for effectively every race back to 2018) - additive to archive_races' own results/qualifying/
    // pit-stops/laps, not a replacement for any of them. Null, not fabricated, where it genuinely
    // doesn't exist yet.
    getRaceSimulation(year, race.round),
    // This exact physical track's own real history, for Grand Prix History/Circuit Records below -
    // simpler here than the live branch's own version: an archive race already carries its own
    // circuitId directly, no findArchiveCircuitByLocation guess needed.
    race.circuitName ? getRacesByCircuit(race.circuitName) : Promise.resolve([]),
    race.circuitId ? getArchiveRacesByCircuitId(race.circuitId) : Promise.resolve([]),
  ]);
  const archiveWinner = race.results.find((r) => r.position === 1);
  const circuitTimeline = buildCircuitTimeline(circuitLiveRaces, circuitArchiveRaces);
  const [ageRecords, raceCommunities, trackStory, layout] = await Promise.all([
    computeAgeRecords(circuitTimeline),
    listRaceCommunities(race.id, session.uid),
    // The real circuit and where the lead changed (pipeline/race_track_story.py); null -> fallback route.
    getRaceTrackStoryByRound(year, race.round),
    getRaceLayout({ circuitId: race.circuitId ?? null, circuitName: null, year, raceName: race.raceName }),
  ]);

  return (
    <div data-surface="frosted" className="page-wide py-8">
      <RaceHeader
        backHref={archiveSeasonHref(year)}
        backLabel={`${year}`}
        roundLabel={`Round ${race.round}`}
        name={race.raceName}
        circuitName={race.circuitName}
        locality={race.locality}
        country={race.country}
        dateLabel={race.raceDate ?? undefined}
        externalLink={race.wikipediaUrl ? { href: race.wikipediaUrl, label: "Full race report" } : undefined}
        resultLabel={archiveWinner ? `Winner: ${archiveWinner.driverName}` : undefined}
      />
      <div className="mt-8">
        <ArchiveRaceDashboard
          race={race}
          circuit={circuit}
          simulation={simulation}
          trackHistory={{ liveRaces: circuitLiveRaces, archiveRaces: circuitArchiveRaces }}
          circuitTimeline={circuitTimeline}
          ageRecords={ageRecords}
          raceCommunities={raceCommunities}
          trackStory={trackStory}
          layout={layout}
        />
      </div>
    </div>
  );
}
