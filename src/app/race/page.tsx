import { notFound } from "next/navigation";
import { ArchiveRaceDashboard } from "@/app/archive/components/ArchiveRaceDashboard";
import { getAllArchiveCircuitsData, getArchiveCircuitData, getArchiveSeasonData } from "@/app/archive/services/archive.service";
import { seasonStatus } from "@/app/season/_service/season.service";
import { SeasonRaceDashboard } from "@/components/race/SeasonRaceDashboard";
import { RaceHeader } from "@/components/raceDetail/RaceHeader";
import { PickPanel } from "@/components/race/PickPanel";
import { SignInGate } from "@/components/auth/SignInGate";
import { findArchiveCircuitByLocation } from "@/lib/supabase/archive";
import { getCalendarEntry } from "@/lib/supabase/calendar";
import { getCurrentEntrants, getRace, getRacesByYear, getRaceSimulation } from "@/lib/supabase/races";
import { computeHighlights } from "@/lib/highlights";
import { comparePolePrediction, comparePrediction } from "@/lib/predictionAccuracy";
import { archiveSeasonHref, slugifyRaceName } from "@/lib/routes";
import { getSession } from "@/lib/session/getSession";

/** The one race-detail route, regardless of where the user came from (Season's calendar or an
 * Archive year) - "the race detail page must be identical regardless of where the user came
 * from." Query-parameterized (?year=&race=), not path segments, matching /archive?year=. Which
 * pipeline backs it follows the same seasonStatus split SeasonDetail's own data layer uses: the
 * live season (real prediction/pole/simulation data) vs. every other year (archive_races - richer
 * completed-race data, real pit-stops/qualifying/laps). */
export default async function RacePage({ searchParams }: { searchParams: Promise<{ year?: string; race?: string }> }) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-16">
        <SignInGate label="this race" />
      </div>
    );
  }

  const { year: yearParam, race: raceParam } = await searchParams;
  const year = Number(yearParam);
  const slug = raceParam ?? "";
  if (!yearParam || !raceParam || Number.isNaN(year)) notFound();

  if (seasonStatus(year) === "ongoing") {
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
    const winner = race.status === "completed" ? race.results?.find((r) => r.finishPosition === 1) : undefined;

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
    const circuitImage = matchedCircuit?.imageUrl ? { url: matchedCircuit.imageUrl, wikipediaUrl: matchedCircuit.wikipediaUrl } : null;
    const raceSessionDate = calendarEntry?.sessions.find((s) => /race/i.test(s.label) && !/sprint/i.test(s.label))?.date ?? calendarEntry?.raceDate ?? null;

    // Only fetched for the one case that actually needs it - a real `upcoming` race (a genuine
    // `races` row exists, so a pick can actually be saved, see PickPanel's own comment) whose own
    // qualifying hasn't happened yet, so there's no race.inputs grid to pick from. `getCurrentEntrants`
    // is the same "most recent real grid" lookup the signup form already uses - not a new source.
    const fallbackEntrants = race.status === "upcoming" && !race.inputs?.length ? await getCurrentEntrants(year) : [];

    return (
      <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-16">
        <RaceHeader
          backHref="/season"
          backLabel={`${race.year}`}
          roundLabel={`Round ${race.round}`}
          name={race.name}
          circuitName={race.circuit}
          country={race.country}
          resultLabel={winner ? `Winner: ${winner.driverName}` : undefined}
        />
        <div className="mt-8">
          <SeasonRaceDashboard race={race} highlights={highlights} accuracy={accuracy} poleAccuracy={poleAccuracy} circuitImage={circuitImage} calendarEntry={calendarEntry} />
        </div>
        {/* Never for a completed race - see PickPanel's own reasoning (the request that drove this:
            no prediction UI, no podium-hit comparison, once a race is history). */}
        {race.status !== "completed" && (
          <div className="mt-8">
            <PickPanel race={race} fallbackEntrants={fallbackEntrants} raceSessionDate={raceSessionDate} />
          </div>
        )}
      </div>
    );
  }

  // getArchiveSeasonData already embeds every race's full results/qualifying/pit-stops - finding
  // the match here is one fetch, not two.
  const races = await getArchiveSeasonData(year);
  const race = races.find((r) => slugifyRaceName(r.raceName) === slug);
  if (!race) notFound();
  const [circuit, simulation] = await Promise.all([
    race.circuitId ? getArchiveCircuitData(race.circuitId) : Promise.resolve(null),
    // Real Monte Carlo data for this exact race, sourced from `races` (confirmed live: populated
    // for effectively every race back to 2018) - additive to archive_races' own results/qualifying/
    // pit-stops/laps, not a replacement for any of them. Null, not fabricated, where it genuinely
    // doesn't exist yet.
    getRaceSimulation(year, race.round),
  ]);
  const archiveWinner = race.results.find((r) => r.position === 1);

  return (
    <div className="mx-auto max-w-[1440px] px-5 py-8 sm:px-8 lg:px-16">
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
        <ArchiveRaceDashboard race={race} circuit={circuit} simulation={simulation} />
      </div>
    </div>
  );
}
