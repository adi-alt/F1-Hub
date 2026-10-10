import Link from "next/link";
import { CircuitHero } from "./CircuitHero";
import { UpcomingCircuitIntelligence } from "./UpcomingCircuitIntelligence";
import { PastWinnersList } from "./PastWinnersList";
import { CircuitTrendChart } from "./CircuitTrendChart";
import { CurrentSeasonPerformance } from "./CurrentSeasonPerformance";
import { CircuitEras } from "./CircuitEras";
import { CircuitRaceStory } from "./CircuitRaceStory";
import { CircuitResultTables } from "./CircuitResultTables";
import { CircuitApexTake } from "./ai/CircuitApexTake";
import { CircuitApexScope } from "./ai/CircuitApexScope";
import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import { TrackIntelligence } from "@/components/race/TrackIntelligence";
import { raceHref } from "@/lib/routes";
import { circuitAvgFieldMovement, type CircuitDetailData } from "../services/circuits.service";

/**
 * The individual circuit page, as a story: who this circuit is, how its latest race unfolded on the circuit itself
 * (the replay plays here, for the current season), how the track has changed through the years, then the numbers -
 * the classification, Apex's read, the records, the winners. Section order adapts to the circuit's own current-season
 * round: a completed one gets its performance card; one still to come gets upcoming intelligence instead, never both
 * and never an empty placeholder. The full history renders every time.
 */
export function CircuitDetailPage({ location, data }: { location: string; data: CircuitDetailData }) {
  const { year, currentSeasonRace, facts, timeline, liveRaces, archiveRaces, raceForSimulation, raceLaps, winnerMedia, currentDrivers, currentTeams, eras, trackStory, raceLayout, replay } = data;
  const grandPrixName =
    currentSeasonRace?.name ?? liveRaces.find((r) => r.year === timeline[0]?.year)?.name ?? archiveRaces.find((r) => r.year === timeline[0]?.year)?.raceName ?? null;
  const country = currentSeasonRace?.country ?? archiveRaces[0]?.country ?? null;
  const trend = liveRaces
    .filter((r) => r.status === "completed" && r.poleTimeSec !== undefined)
    .map((r) => {
      // r.poleSitter is the raw 3-letter code - resolved against this race's own results for a real display name/team
      // (see buildCircuitTimeline's fromLiveRace), not compared against driverName, which would never match.
      const entry = r.results?.find((res) => res.driver === r.poleSitter);
      return {
        year: r.year,
        round: r.round,
        raceName: r.name,
        poleTimeSec: r.poleTimeSec as number,
        poleSitter: entry?.driverName ?? r.poleSitter ?? null,
        team: entry?.team ?? null,
      };
    })
    .sort((a, b) => a.year - b.year);
  const avgFieldMovement = circuitAvgFieldMovement(timeline);
  const winners = timeline.filter((t) => t.winnerDriver).map((t) => ({ year: t.year, winner: t.winnerDriver as string }));
  const isCurrent = raceForSimulation?.year === year;

  return (
    <div data-surface="frosted" className="page-content py-8">
      <CircuitApexScope location={location} circuitName={facts?.venueName ?? location} year={year} status={currentSeasonRace?.state ?? null} />

      <CircuitHero location={location} grandPrixName={grandPrixName} country={country} facts={facts} />

      <div className="space-y-12">
        {raceForSimulation && (
          <RaceSectionCard
            id={replay ? "replay" : "race-story"}
            title={isCurrent ? `${year} ${raceForSimulation.name}` : `The last race here: ${raceForSimulation.year}`}
            description={replay ? "How the race unfolded on the circuit, and a replay of every car." : "How the race unfolded, where it happened on the circuit."}
            headerRight={
              <Link href={raceHref(raceForSimulation.year, raceForSimulation.round, raceForSimulation.name)} className="text-body-sm font-medium text-secondary underline-offset-4 hover:text-primary hover:underline">
                Full race analysis
              </Link>
            }
          >
            <CircuitRaceStory laps={raceLaps} results={raceForSimulation.results ?? []} trackStory={trackStory} layout={raceLayout} replay={replay} />
          </RaceSectionCard>
        )}

        {currentSeasonRace && currentSeasonRace.state !== "completed" && (
          <RaceSectionCard id="next-race" title={currentSeasonRace.state === "next" ? "Next race" : "Upcoming"}>
            <UpcomingCircuitIntelligence race={currentSeasonRace} />
          </RaceSectionCard>
        )}

        {currentSeasonRace?.state === "completed" && (
          <RaceSectionCard id="performance" title={`${year} at this circuit`}>
            <CurrentSeasonPerformance race={currentSeasonRace} year={year} facts={facts} avgFieldMovement={avgFieldMovement} />
          </RaceSectionCard>
        )}

        {eras.length > 0 && (
          <RaceSectionCard id="eras" title="The track through time" description="Every layout this circuit has had, from the earliest on record to the one raced today.">
            <CircuitEras eras={eras} winners={winners} currentYear={year} />
          </RaceSectionCard>
        )}

        {raceForSimulation?.results && (
          <RaceSectionCard id="classification" title={`${raceForSimulation.year} result`} bare>
            <CircuitResultTables race={raceForSimulation} currentDrivers={currentDrivers} currentTeams={currentTeams} />
          </RaceSectionCard>
        )}

        <RaceSectionCard id="apex" title="Apex on this circuit">
          <CircuitApexTake location={location} year={year} status={currentSeasonRace?.state ?? "unscheduled"} />
        </RaceSectionCard>

        {timeline.length > 0 && <TrackIntelligence liveRaces={liveRaces} archiveRaces={archiveRaces} circuitName={facts?.venueName ?? location} />}

        {trend.length >= 2 && (
          <RaceSectionCard id="pole-evolution" title="Pole evolution">
            <CircuitTrendChart data={trend} />
          </RaceSectionCard>
        )}

        {timeline.length > 0 && (
          <RaceSectionCard id="past-winners" title="Past winners" bare>
            <PastWinnersList timeline={timeline} winnerMedia={winnerMedia} currentTeams={currentTeams} />
          </RaceSectionCard>
        )}
      </div>
    </div>
  );
}
