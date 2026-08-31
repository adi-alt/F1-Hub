import { notFound } from "next/navigation";
import { ArchiveRaceDashboard } from "@/app/archive/components/ArchiveRaceDashboard";
import { getArchiveCircuitData, getArchiveSeasonData } from "@/app/archive/services/archive.service";
import { seasonStatus } from "@/app/season/_service/season.service";
import { SeasonRaceDashboard } from "@/components/race/SeasonRaceDashboard";
import { RaceHeader } from "@/components/raceDetail/RaceHeader";
import { PickPanel } from "@/components/race/PickPanel";
import { SignInGate } from "@/components/auth/SignInGate";
import { getRace, getRacesByYear } from "@/lib/supabase/races";
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
      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
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
    // own comment) - only used here to resolve slug -> round; getRace below is the strict,
    // real-data-only fetch that actually 404s a round nothing has been written for yet.
    const roundMatch = (await getRacesByYear(year)).find((r) => slugifyRaceName(r.name) === slug);
    if (!roundMatch) notFound();
    const race = await getRace(year, roundMatch.round);
    if (!race) notFound();

    const highlights = computeHighlights(race);
    const accuracy = comparePrediction(race);
    const poleAccuracy = comparePolePrediction(race);
    const winner = race.status === "completed" ? race.results?.find((r) => r.finishPosition === 1) : undefined;

    return (
      <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
        <RaceHeader
          backHref="/season"
          backLabel={`${race.year} season`}
          roundLabel={`Round ${race.round}`}
          name={race.name}
          circuitName={race.circuit}
          country={race.country}
          resultLabel={winner ? `Winner: ${winner.driverName}` : undefined}
        />
        <div className="mt-8">
          <SeasonRaceDashboard race={race} highlights={highlights} accuracy={accuracy} poleAccuracy={poleAccuracy} />
        </div>
        <div className="mt-8">
          <PickPanel race={race} />
        </div>
      </div>
    );
  }

  // getArchiveSeasonData already embeds every race's full results/qualifying/pit-stops - finding
  // the match here is one fetch, not two.
  const races = await getArchiveSeasonData(year);
  const race = races.find((r) => slugifyRaceName(r.raceName) === slug);
  if (!race) notFound();
  const circuit = race.circuitId ? await getArchiveCircuitData(race.circuitId) : null;
  const archiveWinner = race.results.find((r) => r.position === 1);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-10 sm:px-6">
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
        <ArchiveRaceDashboard race={race} circuit={circuit} />
      </div>
    </div>
  );
}
