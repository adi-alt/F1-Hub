import { CircuitHero, type HeroAnswer } from "./CircuitHero";
import { CircuitRecords } from "./CircuitRecords";
import { PastWinnersList } from "./PastWinnersList";
import { CircuitTrendChart } from "./CircuitTrendChart";
import { CircuitEras } from "./CircuitEras";
import { CircuitRaceTabs } from "./CircuitRaceTabs";
import { CircuitApexTake } from "./ai/CircuitApexTake";
import { CircuitApexScope } from "./ai/CircuitApexScope";
import { PanelSection } from "@/components/ui/PanelSection";
import Link from "next/link";
import { ChevronRight } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
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
  const heroDrawing = data.heroDrawing;

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

      {/* Rows of two, each pair stretched to the taller one's height (PanelSection fill) so neither leaves a blank
          block under it; a section alone in its row takes the full width. */}
      <div className="space-y-10 lg:space-y-12">
        {(raceForSimulation || eras.length > 0) && (
          <div className={`grid grid-cols-1 items-stretch gap-8 lg:gap-6 ${raceForSimulation && eras.length > 0 ? "lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]" : ""}`}>
            {raceForSimulation && (
              <PanelSection
                id="race"
                title={`${raceForSimulation.year} ${raceForSimulation.name}`}
                fill
                action={
                  <Link href={raceHref(raceForSimulation.year, raceForSimulation.round, raceForSimulation.name)} className="flex items-center gap-0.5 rounded-control text-caption text-secondary transition-colors duration-fast hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
                    Full results
                    <Icon icon={ChevronRight} size={16} className="size-3.5" />
                  </Link>
                }
              >
                <CircuitRaceTabs replay={replay} laps={raceLaps} results={raceForSimulation.results ?? []} trackStory={trackStory} layout={raceLayout} />
              </PanelSection>
            )}
            {eras.length > 0 && (
              <PanelSection id="eras" title="The track through time" note="Every layout on record" fill>
                <div className="flex flex-1 flex-col justify-center">
                  <CircuitEras eras={eras} winners={winners} currentYear={year} />
                </div>
              </PanelSection>
            )}
          </div>
        )}

        {/* Apex beside the records; the records take the row when Apex has nothing to say. */}
        <div className="grid grid-cols-1 items-stretch gap-8 lg:grid-cols-2 lg:gap-6 lg:[&:has(>*:only-child)]:grid-cols-1">
          <CircuitApexTake location={location} year={year} status={currentSeasonRace?.state ?? "unscheduled"} />
          {timeline.length > 0 && (
            <PanelSection id="records" title="Records" fill>
              <CircuitRecords timeline={timeline} winnerMedia={winnerMedia} />
            </PanelSection>
          )}
        </div>

        {(timeline.length > 0 || trend.length >= 2) && (
          <div className={`grid grid-cols-1 items-stretch gap-8 lg:gap-6 ${timeline.length > 0 && trend.length >= 2 ? "lg:grid-cols-[minmax(0,1.2fr)_minmax(0,1fr)]" : ""}`}>
            {timeline.length > 0 && (
              <PanelSection id="past-winners" title="Past winners" bare>
                <PastWinnersList timeline={timeline} winnerMedia={winnerMedia} currentTeams={currentTeams} />
              </PanelSection>
            )}
            {trend.length >= 2 && (
              <PanelSection id="pole-evolution" title="Pole times" fill>
                <div className="flex flex-1 flex-col justify-center">
                  {/* As tall as the winners table beside it (up to its 8-row page), so a circuit with few races
                      doesn't leave a short table under a tall chart. */}
                  <CircuitTrendChart data={trend} height={Math.max(180, Math.min(340, Math.min(timeline.length, 8) * 42 - 10))} />
                </div>
              </PanelSection>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
