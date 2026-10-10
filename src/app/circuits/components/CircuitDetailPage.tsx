import Link from "next/link";
import { CircuitHero, type HeroAnswer } from "./CircuitHero";
import { CircuitRecords } from "./CircuitRecords";
import { PastWinnersList } from "./PastWinnersList";
import { CircuitTrendChart } from "./CircuitTrendChart";
import { CircuitEras } from "./CircuitEras";
import { CircuitRaceStory } from "./CircuitRaceStory";
import { CircuitApexTake } from "./ai/CircuitApexTake";
import { CircuitApexScope } from "./ai/CircuitApexScope";
import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import { raceHref } from "@/lib/routes";
import { circuitAvgFieldMovement, type CircuitDetailData } from "../services/circuits.service";

/**
 * The individual circuit page, as a story (audit spec: answer first, one container level, no repeats). The header
 * answers first - who won here last, or when the next race is - beside the circuit's figures. Then how that race
 * unfolded on the circuit itself (the replay plays here, for the current season), the track through the years, its
 * records and winners, pole times, and Apex's read when it has one. The full classification lives on the race page,
 * one link away, rather than being repeated here.
 */
export function CircuitDetailPage({ location, data }: { location: string; data: CircuitDetailData }) {
  const { year, currentSeasonRace, facts, timeline, liveRaces, archiveRaces, raceForSimulation, raceLaps, winnerMedia, currentTeams, eras, trackStory, raceLayout, replay } = data;
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

  const dateOf = (iso: string | null | undefined) =>
    iso ? new Date(`${iso.slice(0, 10)}T12:00:00Z`).toLocaleDateString("en-GB", { weekday: "short", day: "numeric", month: "short", timeZone: "UTC" }) : null;
  // Answer first: the next race when this season's hasn't run, otherwise who won here last.
  const answer: HeroAnswer =
    currentSeasonRace && currentSeasonRace.state !== "completed"
      ? { kind: "next", race: currentSeasonRace, daysToGo: data.daysToGo, dateLabel: dateOf(currentSeasonRace.raceDate) }
      : raceForSimulation
        ? { kind: "result", year, race: raceForSimulation, dateLabel: isCurrent ? dateOf(currentSeasonRace?.raceDate) : null }
        : null;

  return (
    <div data-surface="frosted" className="page-content py-8">
      <CircuitApexScope location={location} circuitName={facts?.venueName ?? location} year={year} status={currentSeasonRace?.state ?? null} />

      <CircuitHero location={location} grandPrixName={grandPrixName} country={country} facts={facts} answer={answer} avgFieldMovement={avgFieldMovement} />

      <div className="space-y-8 lg:space-y-12">
        {raceForSimulation && (
          <RaceSectionCard
            id={replay ? "replay" : "race-story"}
            title={isCurrent ? `How the ${year} race unfolded` : `How the ${raceForSimulation.year} race unfolded`}
            description={replay ? "Where the race was won, on the circuit itself, and a replay of every car." : "Where the race was won, on the circuit itself."}
            headerRight={
              <Link href={raceHref(raceForSimulation.year, raceForSimulation.round, raceForSimulation.name)} className="text-body-sm font-medium text-secondary underline-offset-4 hover:text-primary hover:underline">
                Full results and analysis
              </Link>
            }
          >
            <CircuitRaceStory laps={raceLaps} results={raceForSimulation.results ?? []} trackStory={trackStory} layout={raceLayout} replay={replay} />
          </RaceSectionCard>
        )}

        {eras.length > 0 && (
          <RaceSectionCard id="eras" title="The track through time" description="Every layout this circuit has had, from the earliest on record to the one raced today.">
            <CircuitEras eras={eras} winners={winners} currentYear={year} />
          </RaceSectionCard>
        )}

        {timeline.length > 0 && (
          <RaceSectionCard id="records" title="Records">
            <CircuitRecords timeline={timeline} />
          </RaceSectionCard>
        )}

        {timeline.length > 0 && (
          <RaceSectionCard id="past-winners" title="Past winners" bare>
            <PastWinnersList timeline={timeline} winnerMedia={winnerMedia} currentTeams={currentTeams} />
          </RaceSectionCard>
        )}

        {trend.length >= 2 && (
          <RaceSectionCard id="pole-evolution" title="Pole times">
            <CircuitTrendChart data={trend} />
          </RaceSectionCard>
        )}

        <CircuitApexTake location={location} year={year} status={currentSeasonRace?.state ?? "unscheduled"} />
      </div>
    </div>
  );
}
