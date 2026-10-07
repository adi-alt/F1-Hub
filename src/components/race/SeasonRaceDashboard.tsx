"use client";

import { useState } from "react";
import type { MultiSelectOption } from "@/app/season/_components/EntityMultiSelect";
import { DriverSetFilter, DriverSetPanels, DriverSetTabs } from "@/components/race/DriverSetTabs";
import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import { ApexTrackBriefing } from "@/components/raceDetail/ApexTrackBriefing";
import { RaceApexScope } from "@/components/raceDetail/RaceApexScope";
import { RaceHistorySection } from "@/components/raceDetail/RaceHistorySection";
import { RaceCommunitiesSection } from "@/components/raceDetail/RaceCommunitiesSection";
import type { RaceCommunityCard } from "@/lib/groupPredictionTypes";
import type { CircuitYearRecord } from "@/lib/circuitIntelligence";
import type { AgeRecords } from "@/lib/circuitRecords";
import type { PersonalRaceContext } from "@/lib/personalRaceBriefing";
import { RaceIntelligenceSection } from "@/components/raceDetail/intelligence/RaceIntelligenceSection";
import type { ContextSource } from "@/lib/ai/schemas/raceIntelligence";
import { RaceSubSection } from "@/components/raceDetail/RaceSubSection";
import { useScrollToSection } from "@/hooks/useScrollToSection";
import { filterDriverSet, type DriverSet } from "@/lib/driverSet";
import { formatLapTime } from "@/lib/format";
import { teamColor } from "@/lib/teamColors";
import type { RaceHighlights } from "@/lib/highlights";
import type { PredictionAccuracy, PolePredictionAccuracy } from "@/lib/predictionAccuracy";
import type { RaceDoc } from "@/lib/types/race";
import { ModelInfo } from "./ModelInfo";
import { ModelOutlook } from "./ModelOutlook";
import { PickPanel } from "./PickPanel";
import { RaceClassification } from "./RaceClassification";
import { RaceRail } from "./RaceRail";
import { RaceReadiness } from "@/components/home/RaceReadiness";
import { PoleSection } from "./PoleSection";
import { PolePredictionComparison } from "./PolePredictionComparison";
import { PracticeSummary } from "./PracticeSummary";
import { PredictionComparison } from "./PredictionComparison";
import { QualifyingGapChart } from "./QualifyingGapChart";
import { SimulationPanel } from "./SimulationPanel";
import { TireStintTimeline } from "./TireStintTimeline";
import type { ArchiveRaceDoc } from "@/lib/supabase/archive";
import type { CalendarEntry } from "@/lib/supabase/calendar";
import { PositionChangesPanel, type PositionChangeEntry } from "@/components/raceDetail/PositionChangesPanel";
import { LapChart, type LapChartResultEntry } from "@/components/raceDetail/LapChart";
import { useSeasonLaps } from "@/hooks/useSeasonLaps";

/** The season race page, as a story that follows the race's phase (spec §3.1). Before the race: the weekend's
 * schedule, your pick, what the model expects, the preview, then history. After it: the result first, how the
 * predictions did, the analysis, the race story, then history. One rail beside it with at most three blocks
 * (RaceRail); the countdown or the winner sits in the page header. Every section still appears only when its
 * data is real. */
export function SeasonRaceDashboard({
  race,
  highlights,
  accuracy,
  poleAccuracy,
  calendarEntry,
  trackHistory,
  circuitTimeline,
  ageRecords,
  personalContext,
  raceCommunities,
  fallbackEntrants = [],
  raceSessionDate = null,
}: {
  race: RaceDoc;
  highlights: RaceHighlights | null;
  accuracy: PredictionAccuracy | null;
  poleAccuracy: PolePredictionAccuracy | null;
  // Real, not fabricated - see race/page.tsx's findArchiveCircuitByLocation call and
  // SeasonConditionsCard's own comment. Null/undefined for a venue the archive hasn't reached yet.
  circuitImage?: { url: string; wikipediaUrl: string | null } | null;
  // The real session schedule (see RaceWeekendPanel) - null for a venue/year `calendar` genuinely
  // has no row for, same "real or absent, never fabricated" rule as circuitImage above.
  calendarEntry?: CalendarEntry | null;
  // This exact physical track's own real history, both real sources (see RaceHistorySection /
  // circuitIntelligence.ts) - fetched by the caller for every race regardless of phase (see
  // race/page.tsx's own comment on why the old "completed races don't need this" gate no longer
  // holds). RaceHistorySection's own Trends tab folds in what used to be a separate, standalone
  // "Track Intelligence" section - shown for every phase now, not pre-race-only.
  trackHistory?: { liveRaces: RaceDoc[]; archiveRaces: ArchiveRaceDoc[] };
  // buildCircuitTimeline(trackHistory), already computed once by the caller (which also needs it
  // for ageRecords below) - not rebuilt here a second time.
  circuitTimeline: CircuitYearRecord[];
  // Real ages, resolved server-side - see circuitRecords.ts's own top comment for why (Supabase
  // access this page's other client components can't have).
  ageRecords: AgeRecords;
  // Real user data (favorites, this circuit's own real prediction accuracy) - null-shaped fields
  // throughout for whichever the user genuinely hasn't got yet, never a guessed favorite (see
  // personalRaceBriefing.ts's own comment).
  personalContext: PersonalRaceContext;
  raceCommunities: { mode: "predicting" | "discover"; communities: RaceCommunityCard[] };
  // For the podium pick (PickPanel): the grid to choose from before qualifying, and lights out.
  fallbackEntrants?: { driver: string; driverName: string; team: string }[];
  raceSessionDate?: string | null;
}) {
  const { liveRaces: trackLiveRaces = [], archiveRaces: trackArchiveRaces = [] } = trackHistory ?? {};
  useScrollToSection();
  // Shared between Qualifying and Strategy - one control, not each picking its own. Each side
  // keeps its own natural ordering (Qualifying by grid, Strategy by finishing position - its
  // existing convention) sliced to this same count, rather than forcing identical driver
  // identities across two genuinely different rankings onto one side or the other.
  const [driverSet, setDriverSet] = useState<DriverSet>("top5");
  // Only meaningful while driverSet === "custom" - kept even when switching away so re-selecting
  // Custom later doesn't lose the previous picks.
  const [customDriverIds, setCustomDriverIds] = useState<string[]>([]);
  const isCompleted = race.status === "completed" && !!race.results;
  const { data: laps, isLoading: lapsLoading, isError: lapsError } = useSeasonLaps(race.year, race.round);

  // Same real grid/finish data the old full-width MovementChart plotted, now feeding the full-width
  // Race Performance comparison instead - every classified driver (DNFs excluded, no grid data to
  // compare from), not only the ones who actually moved, sorted biggest gainer first.
  const allMovementEntries: PositionChangeEntry[] =
    isCompleted && race.results
      ? race.results
          .filter((r) => r.status !== "dnf" && r.grid !== null)
          .map((r) => ({ code: r.driver, driverId: r.driver, grid: r.grid!, finish: r.finishPosition, movement: r.grid! - r.finishPosition }))
          .sort((a, b) => b.movement - a.movement || a.finish - b.finish)
      : [];
  // The whole field's own real range, not just whoever's currently visible - Race Performance's
  // position-flow track uses one fixed P1..P{fieldSize} scale so switching Top 5 -> All never
  // rescales the axis underneath rows already on screen.
  const fieldSize =
    isCompleted && race.results
      ? Math.max(1, ...race.results.filter((r) => r.status !== "dnf" && r.grid !== null).map((r) => Math.max(r.grid!, r.finishPosition)))
      : 1;

  // Whatever's honestly knowable client-side, pre-generation - the rest (championship/keyMoments/
  // trackHistory/favoriteDriver/favoriteTeam) only becomes known once the route responds with the
  // real server-computed dataCoverage.
  const intelligencePreCoverage: Partial<Record<ContextSource, boolean>> = {
    classification: !!race.results?.length,
    weather: !!race.weather,
    tireStrategy: !!race.tireStints?.length,
    compoundPace: !!race.tireCompoundPace?.length,
    safetyCar: race.safetyCarPeriods !== undefined && race.safetyCarPeriods !== null,
    traffic: !!race.trafficStats?.length,
  };
  // MovementChart used to live in this section (below), gated on isCompleted alone - now that its
  // data feeds the compact Race Performance view instead, this section only ever shows real
  // prediction-accuracy content, so it's gated on that content actually existing, not on the race
  // simply being completed.
  const hasAnalysis = !!accuracy || !!poleAccuracy || !!race.prediction || !!race.polePrediction;
  const hasPractice = !!race.practice;
  const hasQualifying = !!race.inputs?.length;
  const hasStrategy = !!race.tireStints?.length;
  const hasPositionChanges = allMovementEntries.length > 0;
  // No `lapsBackfilled`-style flag on RaceDoc (see races.ts's getRaceLaps comment) - gated on the
  // race having actually run instead, same as the other three; LapChart's own empty state covers
  // the gap between "completed" and "backfill_race_laps() has caught this one up yet".
  const hasLapChart = isCompleted;
  // Only ever renders once at least one of these is real - a "not yet available" placeholder
  // paragraph used to keep this card (and Practice/Qualifying's own sub-sections) rendering
  // through the entire pre-race window regardless, which is exactly the "card just to say data
  // will appear later" this was called out for. Race Weekend (the schedule) and Race History &
  // Records (what's knowable from history) already cover what a reader needs before any session
  // has actually run - Race Analysis now only exists once it has something real to analyze.
  const hasSessionAnalysis = hasPractice || hasQualifying || hasStrategy || hasPositionChanges || hasLapChart;
  const showQualifyingSlot = hasQualifying;
  const showQualifyingStrategyRow = showQualifyingSlot || hasStrategy;
  const showPracticeSlot = hasPractice;
  // Real RaceResultEntry rows use `driver`/`finishPosition`, not LapChart's own `driverId`/
  // `position` - the one place that naming gap needs bridging, same "adapt at the call site"
  // pattern as toResultRow above.
  const lapChartResults: LapChartResultEntry[] = (race.results ?? []).map((r) => ({ driverId: r.driver, driverName: r.driverName, position: r.finishPosition }));
  const visibleMovementEntries = filterDriverSet(allMovementEntries, driverSet, (e) => e.driverId, customDriverIds);
  // The full roster (not just classified/finishers) - Custom should still be able to pick a driver
  // who retired, same as every other picker on this page.
  const customSelectOptions: MultiSelectOption[] = (race.results ?? []).map((r) => ({ code: r.driver, label: r.driverName, color: teamColor(r.team) }));
  // Nothing left to filter down to for a field of 5 or fewer. Governs Qualifying, Strategy, Lap
  // Progression, and Race Performance together - one control for the whole section, not each
  // panel's own.
  const driverSetFilterable =
    Math.max(hasQualifying ? race.inputs!.length : 0, hasStrategy ? race.tireStints!.length : 0, allMovementEntries.length) > 5;

  const nameByCode = new Map<string, string>([...(race.inputs ?? []), ...(race.results ?? [])].map((d) => [d.driver, d.driverName]));
  const nameOf = (code: string) => nameByCode.get(code) ?? code;
  const preliminary = race.resultsSource === "openf1_preliminary";
  const byFinish = [...(race.results ?? [])].sort((a, b) => a.finishPosition - b.finishPosition);
  const [first, second, third] = byFinish;
  // The answer in one sentence, before the table (spec P10).
  const resultHeadline =
    isCompleted && first
      ? `${first.driverName} won${second?.finishGapSec ? ` by ${second.finishGapSec.toFixed(3)}s` : ""}${second && third ? `, ahead of ${second.driverName} and ${third.driverName}` : ""}.`
      : undefined;
  // The race in four numbers, under the result, as plain figures rather than four boxed tiles.
  const raceNumbers =
    isCompleted && highlights
      ? [
          { label: "Pole", value: nameOf(highlights.poleSitter) },
          { label: "Fastest lap", value: highlights.fastestLap ? `${nameOf(highlights.fastestLap.driver)} · ${formatLapTime(highlights.fastestLap.timeSec)}` : "–" },
          { label: "Biggest climb", value: highlights.biggestGainer ? `${nameOf(highlights.biggestGainer.driver)} +${highlights.biggestGainer.positionsGained}` : "–" },
          { label: "Retirements", value: String(highlights.dnfs.length) },
        ]
      : null;

  const analysis = hasSessionAnalysis && (
    <DriverSetTabs value={driverSet} onValueChange={setDriverSet}>
      <RaceSectionCard
        id="analysis"
        title={isCompleted ? "Race analysis" : "Weekend so far"}
        description={isCompleted ? "Qualifying pace, tyre strategy, lap by lap, and who gained or lost places." : "Practice and qualifying, as they happen."}
        headerRight={
          driverSetFilterable ? <DriverSetFilter value={driverSet} customOptions={customSelectOptions} customIds={customDriverIds} onCustomIdsChange={setCustomDriverIds} /> : undefined
        }
      >
        <DriverSetPanels filterable={driverSetFilterable}>
          {showPracticeSlot && (
            <RaceSubSection label="Practice" first>
              {/* Merged, not `inputs ?? results`: race_inputs can be a few drivers short of the full field while
                  race_results already has everyone. Same driver in both resolves to the same name either way. */}
              <PracticeSummary practice={race.practice!} roster={[...(race.inputs ?? []), ...(race.results ?? [])]} />
            </RaceSubSection>
          )}
          {showQualifyingSlot && (
            <div id="qualifying">
              <RaceSubSection label="Qualifying" description="Gap to pole across the field." first={!showPracticeSlot}>
                <QualifyingGapChart inputs={race.inputs!} driverSet={driverSet} customIds={customDriverIds} />
              </RaceSubSection>
            </div>
          )}
          {hasStrategy && (
            <div id="strategy">
              <RaceSubSection label="Strategy" description="Tyre compounds and stint lengths." first={!showPracticeSlot && !showQualifyingSlot}>
                <TireStintTimeline stints={race.tireStints!} results={race.results ?? []} driverSet={driverSet} customIds={customDriverIds} />
              </RaceSubSection>
            </div>
          )}
          {hasLapChart && (
            <div id="lap-chart">
              <RaceSubSection label="Lap by lap" description="Race position on every lap." first={!showPracticeSlot && !showQualifyingStrategyRow}>
                <LapChart laps={laps} isLoading={lapsLoading} isError={lapsError} results={lapChartResults} driverSet={driverSet} customIds={customDriverIds} />
              </RaceSubSection>
            </div>
          )}
          {hasPositionChanges && (
            <div id="race-performance">
              <RaceSubSection label="Places gained and lost" description="Starting grid compared with the finish." first={!hasPractice && !hasQualifying && !hasStrategy && !hasLapChart}>
                <PositionChangesPanel entries={visibleMovementEntries} fieldSize={fieldSize} />
              </RaceSubSection>
            </div>
          )}
        </DriverSetPanels>
      </RaceSectionCard>
    </DriverSetTabs>
  );

  const communities = raceCommunities.mode === "predicting" && <RaceCommunitiesSection mode={raceCommunities.mode} communities={raceCommunities.communities} id="communities" />;
  const history = <RaceHistorySection raceName={race.name} circuitName={race.circuit} timeline={circuitTimeline} liveRaces={trackLiveRaces} archiveRaces={trackArchiveRaces} ageRecords={ageRecords} />;

  return (
    // The main column tells the race's story; the rail (at most three blocks) sits beside it from lg, and
    // after it on smaller screens. Sections are separated by space (48px), not boxes.
    <div className="grid gap-x-8 gap-y-12 lg:grid-cols-[minmax(0,1fr)_300px] lg:items-start xl:grid-cols-[minmax(0,1fr)_320px]">
      <div className="min-w-0 space-y-12">
        <RaceApexScope raceId={race.id} circuit={race.circuit} year={race.year} name={race.name} status={isCompleted ? "completed" : "upcoming"} />

        {isCompleted ? (
          <>
            <RaceSectionCard id="results" title="Result" description={resultHeadline} bare>
              <RaceClassification results={race.results!} stints={race.tireStints} preliminary={preliminary} />
              {raceNumbers && (
                <dl className="mt-6 grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                  {raceNumbers.map((n) => (
                    <div key={n.label} className="min-w-0">
                      <dt className="text-caption text-secondary">{n.label}</dt>
                      <dd className="mt-1 truncate text-body-sm font-medium tabular text-primary">{n.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </RaceSectionCard>

            {hasAnalysis && (accuracy || poleAccuracy) && (
              <RaceSectionCard id="predictions" title="How the predictions did" bare>
                <div className="grid gap-4 sm:grid-cols-2">
                  {accuracy && <PredictionComparison accuracy={accuracy} />}
                  {poleAccuracy && <PolePredictionComparison accuracy={poleAccuracy} />}
                </div>
              </RaceSectionCard>
            )}

            {analysis}
            <RaceIntelligenceSection raceId={race.id} preCoverage={intelligencePreCoverage} />

            {/* The pre-race simulation, kept for comparison with what happened. */}
            {race.simulation && (
              <RaceSectionCard id="simulation" title="What the model expected" description="10,000 simulated races from the grid, race pace and retirement odds, frozen before the start.">
                <SimulationPanel simulation={race.simulation} />
              </RaceSectionCard>
            )}
            {communities}
            {history}
          </>
        ) : (
          <>
            {calendarEntry && calendarEntry.sessions.length > 0 && (
              <RaceSectionCard id="weekend" title="This weekend">
                <RaceReadiness calendarEntry={calendarEntry} race={race} />
              </RaceSectionCard>
            )}

            <RaceSectionCard id="pick" title="Your podium pick" description="Locks at lights out. Three points for each driver in the right place, one for the right driver in the wrong place." bare>
              <PickPanel race={race} fallbackEntrants={fallbackEntrants} raceSessionDate={raceSessionDate} />
            </RaceSectionCard>

            {race.simulation || race.prediction ? (
              <RaceSectionCard id="prediction" title="What the model expects">
                <ModelOutlook simulation={race.simulation} prediction={race.prediction} nameOf={nameOf} />
                <div className="mt-5">
                  <ModelInfo />
                </div>
              </RaceSectionCard>
            ) : (
              race.polePrediction && (
                <RaceSectionCard id="prediction" title="Who the model expects on pole">
                  <PoleSection polePrediction={race.polePrediction} />
                </RaceSectionCard>
              )
            )}

            {analysis}

            <ApexTrackBriefing location={race.circuit} year={race.year} section={{ id: "preview", title: "Preview" }} />
            {communities}
            {history}
          </>
        )}
      </div>

      <aside aria-label="About this race" className="min-w-0 lg:sticky lg:top-20 lg:max-h-[calc(100dvh-6rem)] lg:self-start lg:overflow-y-auto">
        <RaceRail
          completed={isCompleted}
          circuit={race.circuit}
          weather={race.weather}
          forecast={calendarEntry?.weatherForecast}
          personal={personalContext}
          accuracy={accuracy}
          communities={raceCommunities.mode === "predicting" ? raceCommunities.communities : []}
          nameOf={nameOf}
        />
      </aside>
    </div>
  );
}
