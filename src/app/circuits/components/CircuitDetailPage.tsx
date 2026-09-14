import Link from "next/link";
import { CircuitHero } from "./CircuitHero";
import { CurrentSeasonPerformance } from "./CurrentSeasonPerformance";
import { UpcomingCircuitIntelligence } from "./UpcomingCircuitIntelligence";
import { PastWinnersList } from "./PastWinnersList";
import { CircuitTrendChart } from "./CircuitTrendChart";
import { TrackMap, DriverTower } from "@/components/circuit/TrackMap";
import { GridToFinishChart } from "@/components/circuit/GridToFinishChart";
import { TrackIntelligence } from "@/components/race/TrackIntelligence";
import { CircuitApexTake } from "./ai/CircuitApexTake";
import { CircuitApexScope } from "./ai/CircuitApexScope";
import { circuitAvgFieldMovement, type CircuitDetailData } from "../services/circuits.service";
import { raceHref } from "@/lib/routes";

/**
 * The individual circuit page - a circuit INTELLIGENCE page, not a chart and a table. Section
 * order adapts to what this circuit's own current-season race actually is: a completed round gets
 * this year's performance (Track Character folded into that same card, by design - see
 * CurrentSeasonPerformance's own comment); a round still to come gets upcoming intelligence
 * instead, never both and never an empty "2026 Performance" placeholder for a race that hasn't
 * run. The full multi-decade history (Track Intelligence, Pole Evolution, Past Winners) renders
 * every time regardless - it's true no matter where the calendar currently sits.
 */
export function CircuitDetailPage({ location, data }: { location: string; data: CircuitDetailData }) {
  const { year, currentSeasonRace, facts, timeline, liveRaces, archiveRaces, raceForSimulation, raceLaps, winnerMedia } = data;
  const grandPrixName =
    currentSeasonRace?.name ?? liveRaces.find((r) => r.year === timeline[0]?.year)?.name ?? archiveRaces.find((r) => r.year === timeline[0]?.year)?.raceName ?? null;
  const country = currentSeasonRace?.country ?? archiveRaces[0]?.country ?? null;
  const trend = liveRaces
    .filter((r) => r.status === "completed" && r.poleTimeSec !== undefined)
    .map((r) => {
      // r.poleSitter is the raw 3-letter code (see circuitIntelligence.ts's own note on this same
      // field) - resolved against this race's own results for a real display name/team, exactly
      // like buildCircuitTimeline's fromLiveRace does, rather than showing the bare code or
      // comparing it against driverName (which would never match).
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

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <CircuitApexScope location={location} circuitName={facts?.venueName ?? location} year={year} status={currentSeasonRace?.state ?? null} />

      <CircuitHero location={location} grandPrixName={grandPrixName} country={country} facts={facts} />

      <div className="mb-8">
        <div className="flex items-baseline justify-between gap-3">
          <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
            {raceForSimulation ? `Track experience — ${raceForSimulation.year}` : "Track layout"}
          </p>
          {/* The one deliberate link out of this circuit-across-time page into the event-specific
              Race page - "this track's most recent classified race" for full results, laps,
              strategy and incidents, which the Circuit page itself never duplicates. Styled as a
              real CTA (not a quiet text link) since it's the one path off this page into the
              event itself. */}
          {raceForSimulation && (
            <Link
              href={raceHref(raceForSimulation.year, raceForSimulation.round, raceForSimulation.name)}
              className="shrink-0 rounded-lg bg-[var(--f1-red)] px-3 py-1.5 text-[11px] font-semibold text-white transition hover:brightness-110"
            >
              Full race analysis →
            </Link>
          )}
        </div>
        <div aria-hidden className="mt-2 h-px w-full bg-gradient-to-r from-white/[0.09] to-transparent" />
        <div className="mt-4 grid grid-cols-1 items-stretch gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          {/* Left: this season's own real result at this circuit (when it's run, Track Character
              included), then the track map and its own playback controls/legend/driver readout -
              the map is flex-1 at lg+ so it fills whatever's left after the performance card,
              matching the right column's real height instead of leaving dead space under a fixed-
              aspect map. Right: two stacked cards, classification then grid->finish, both real
              data about the same `raceForSimulation` race the map itself is replaying. */}
          <div className="flex min-w-0 flex-col gap-8 lg:h-full">
            {currentSeasonRace?.state === "completed" && (
              <CurrentSeasonPerformance race={currentSeasonRace} year={year} facts={facts} avgFieldMovement={avgFieldMovement} />
            )}
            <TrackMap
              className="lg:min-h-0 lg:flex-1"
              seed={location}
              turns={facts?.turns ?? 14}
              trackType={facts?.trackType ?? "permanent"}
              results={raceForSimulation?.results ?? null}
              tireStints={raceForSimulation?.tireStints ?? null}
              raceLaps={raceForSimulation ? raceLaps : null}
              raceLabel={raceForSimulation ? `${raceForSimulation.year} race` : null}
            />
          </div>
          {raceForSimulation?.results && (
            <div className="flex min-w-0 flex-col gap-6">
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{raceForSimulation.year} classification</p>
                <DriverTower results={raceForSimulation.results} />
              </div>
              <div>
                <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Grid → finish</p>
                <GridToFinishChart results={raceForSimulation.results} tireStints={raceForSimulation.tireStints ?? []} />
              </div>
            </div>
          )}
        </div>
      </div>

      <div className="mb-8">
        <CircuitApexTake location={location} year={year} status={currentSeasonRace?.state ?? "unscheduled"} />
      </div>

      {currentSeasonRace && currentSeasonRace.state !== "completed" && (
        <div className="mb-8">
          <UpcomingCircuitIntelligence race={currentSeasonRace} />
        </div>
      )}

      {timeline.length > 0 && (
        <div className="mb-8">
          <TrackIntelligence liveRaces={liveRaces} archiveRaces={archiveRaces} circuitName={facts?.venueName ?? location} />
        </div>
      )}

      {trend.length >= 2 && (
        <div className="mb-8">
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Pole evolution</p>
          <CircuitTrendChart data={trend} />
        </div>
      )}

      {timeline.length > 0 && (
        <div>
          <p className="mb-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">Past winners</p>
          <PastWinnersList timeline={timeline} winnerMedia={winnerMedia} />
        </div>
      )}
    </div>
  );
}
