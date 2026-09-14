import { CircuitHero } from "./CircuitHero";
import { CircuitCharacteristics } from "./CircuitCharacteristics";
import { CurrentSeasonPerformance } from "./CurrentSeasonPerformance";
import { UpcomingCircuitIntelligence } from "./UpcomingCircuitIntelligence";
import { PastWinnersList } from "./PastWinnersList";
import { CircuitTrendChart } from "./CircuitTrendChart";
import { TrackMap, DriverTower } from "@/components/circuit/TrackMap";
import { TrackIntelligence } from "@/components/race/TrackIntelligence";
import { CircuitApexTake } from "./ai/CircuitApexTake";
import { CircuitApexScope } from "./ai/CircuitApexScope";
import { circuitAvgFieldMovement, type CircuitDetailData } from "../services/circuits.service";

/**
 * The individual circuit page - a circuit INTELLIGENCE page, not a chart and a table. Section
 * order adapts to what this circuit's own current-season race actually is: a completed round gets
 * this year's performance; a round still to come gets upcoming intelligence instead, never both
 * and never an empty "2026 Performance" placeholder for a race that hasn't run. Track
 * characteristics and the full multi-decade history render every time - they're true regardless
 * of where the calendar currently sits.
 */
export function CircuitDetailPage({ location, data }: { location: string; data: CircuitDetailData }) {
  const { year, currentSeasonRace, facts, timeline, liveRaces, archiveRaces, raceForSimulation } = data;
  const grandPrixName =
    currentSeasonRace?.name ?? liveRaces.find((r) => r.year === timeline[0]?.year)?.name ?? archiveRaces.find((r) => r.year === timeline[0]?.year)?.raceName ?? null;
  const country = currentSeasonRace?.country ?? archiveRaces[0]?.country ?? null;
  const trend = liveRaces
    .filter((r) => r.status === "completed" && r.poleTimeSec !== undefined)
    .map((r) => ({ year: r.year, poleTimeSec: r.poleTimeSec as number }))
    .sort((a, b) => a.year - b.year);
  const avgFieldMovement = circuitAvgFieldMovement(timeline);

  return (
    <div className="mx-auto max-w-[1200px] px-4 py-8 sm:px-6">
      <CircuitApexScope location={location} circuitName={facts?.venueName ?? location} year={year} status={currentSeasonRace?.state ?? null} />

      <CircuitHero location={location} grandPrixName={grandPrixName} country={country} facts={facts} />

      <div className="mb-8">
        <p className="text-[10px] font-semibold uppercase tracking-[0.18em] text-neutral-500">
          {raceForSimulation ? `Track experience — ${raceForSimulation.year}` : "Track layout"}
        </p>
        <div aria-hidden className="mt-2 h-px w-full bg-gradient-to-r from-white/[0.09] to-transparent" />
        <div className="mt-4 grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)]">
          <TrackMap
            seed={location}
            turns={facts?.turns ?? 14}
            trackType={facts?.trackType ?? "permanent"}
            results={raceForSimulation?.results ?? null}
            tireStints={raceForSimulation?.tireStints ?? null}
            raceLabel={raceForSimulation ? `${raceForSimulation.year} race` : null}
          />
          {raceForSimulation?.results && (
            <div className="min-w-0">
              <p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-500">{raceForSimulation.year} classification</p>
              <DriverTower results={raceForSimulation.results} />
            </div>
          )}
        </div>
      </div>

      <div className="mb-8">
        <CircuitApexTake location={location} year={year} status={currentSeasonRace?.state ?? "unscheduled"} />
      </div>

      {currentSeasonRace?.state === "completed" && (
        <div className="mb-8">
          <CurrentSeasonPerformance race={currentSeasonRace} year={year} />
        </div>
      )}
      {currentSeasonRace && currentSeasonRace.state !== "completed" && (
        <div className="mb-8">
          <UpcomingCircuitIntelligence race={currentSeasonRace} />
        </div>
      )}

      <div className="mb-8">
        <CircuitCharacteristics facts={facts} avgFieldMovement={avgFieldMovement} />
      </div>

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
          <PastWinnersList timeline={timeline} />
        </div>
      )}
    </div>
  );
}
