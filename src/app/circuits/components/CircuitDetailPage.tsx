import { CircuitHero } from "./CircuitHero";
import { UpcomingCircuitIntelligence } from "./UpcomingCircuitIntelligence";
import { PastWinnersList } from "./PastWinnersList";
import { CircuitTrendChart } from "./CircuitTrendChart";
import { TrackExperienceGrid } from "./TrackExperienceGrid";
import { TrackIntelligence } from "@/components/race/TrackIntelligence";
import { CircuitApexScope } from "./ai/CircuitApexScope";
import { circuitAvgFieldMovement, type CircuitDetailData } from "../services/circuits.service";

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
  const { year, currentSeasonRace, facts, timeline, liveRaces, archiveRaces, raceForSimulation, raceLaps, winnerMedia, currentDrivers, currentTeams } = data;
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

      <TrackExperienceGrid
        location={location}
        year={year}
        facts={facts}
        currentSeasonRace={currentSeasonRace}
        raceForSimulation={raceForSimulation}
        raceLaps={raceLaps}
        avgFieldMovement={avgFieldMovement}
        currentDrivers={currentDrivers}
        currentTeams={currentTeams}
      />

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
          <PastWinnersList timeline={timeline} winnerMedia={winnerMedia} currentTeams={currentTeams} />
        </div>
      )}
    </div>
  );
}
