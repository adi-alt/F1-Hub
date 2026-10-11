import Link from "next/link";
import { CircuitHero, type HeroAnswer } from "./CircuitHero";
import { CircuitRecords } from "./CircuitRecords";
import { PastWinnersList } from "./PastWinnersList";
import { CircuitTrendChart } from "./CircuitTrendChart";
import { CircuitEras } from "./CircuitEras";
import { CircuitRaceStory } from "./CircuitRaceStory";
import { ReplaySection } from "@/components/raceDetail/ReplaySection";
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

  // The hero's photography: this season's race here, else the most recent race here that has photos.
  const photos =
    (currentSeasonRace?.photoUrls?.length ? currentSeasonRace.photoUrls : null) ??
    [...liveRaces].sort((a, b) => b.year - a.year).find((r) => r.photoUrls?.length)?.photoUrls ??
    [];
  const heroDrawing = (eras.find((e) => e.layout.seasons.includes(year) && !e.layout.raceNameMatch) ?? eras[eras.length - 1])?.drawing ?? null;

  return (
    <div data-surface="frosted" className="page-wide pb-12">
      <CircuitApexScope location={location} circuitName={facts?.venueName ?? location} year={year} status={currentSeasonRace?.state ?? null} />

      <CircuitHero
        location={location}
        grandPrixName={grandPrixName}
        country={country}
        facts={facts}
        answer={answer}
        avgFieldMovement={avgFieldMovement}
        photos={photos.slice(0, 4)}
        drawing={heroDrawing}
      />

      {/* One column, each section full width and sized to its content: the race, Apex's read of it, the records,
          then the history. (A main column beside a rail left whichever side was shorter standing empty.) */}
      <div className="space-y-8 lg:space-y-12">
        {replay && raceForSimulation && (
          <RaceSectionCard
            id="replay"
            title={`${raceForSimulation.year} race replay`}
            description="Every car on the real circuit, lights out to the flag. Press play, scrub the timeline, or jump to a lead change."
            headerRight={
              <Link href={raceHref(raceForSimulation.year, raceForSimulation.round, raceForSimulation.name)} className="text-body-sm font-medium text-secondary underline-offset-4 hover:text-primary hover:underline">
                Full results
              </Link>
            }
          >
            <ReplaySection entry={replay} inline />
          </RaceSectionCard>
        )}

        {raceForSimulation && (
          <RaceSectionCard
            id="race-story"
            title={`How the ${raceForSimulation.year} race unfolded`}
            description="Every lead change, and where on the circuit it happened. Pick a moment to see it."
            headerRight={
              !replay ? (
                <Link href={raceHref(raceForSimulation.year, raceForSimulation.round, raceForSimulation.name)} className="text-body-sm font-medium text-secondary underline-offset-4 hover:text-primary hover:underline">
                  Full results
                </Link>
              ) : undefined
            }
          >
            <CircuitRaceStory laps={raceLaps} results={raceForSimulation.results ?? []} trackStory={trackStory} layout={raceLayout}  />
          </RaceSectionCard>
        )}

        <CircuitApexTake location={location} year={year} status={currentSeasonRace?.state ?? "unscheduled"} />

        {timeline.length > 0 && (
          <RaceSectionCard id="records" title="Records">
            <CircuitRecords timeline={timeline} winnerMedia={winnerMedia} />
          </RaceSectionCard>
        )}

        {eras.length > 0 && (
          <RaceSectionCard id="eras" title="The track through time" description="Every layout this circuit has had, from the earliest on record to the one raced today.">
            <CircuitEras eras={eras} winners={winners} currentYear={year} />
          </RaceSectionCard>
        )}

        {(timeline.length > 0 || trend.length >= 2) && (
          <div className={`grid grid-cols-1 items-stretch gap-8 lg:gap-10 ${timeline.length > 0 && trend.length >= 2 ? "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" : ""}`}>
            {timeline.length > 0 && (
              <RaceSectionCard id="past-winners" title="Past winners" bare>
                <PastWinnersList timeline={timeline} winnerMedia={winnerMedia} currentTeams={currentTeams} />
              </RaceSectionCard>
            )}
            {trend.length >= 2 && (
              <RaceSectionCard id="pole-evolution" title="Pole times">
                <CircuitTrendChart data={trend} height={380} />
              </RaceSectionCard>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
