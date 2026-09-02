"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { QuietTabs } from "@/app/season/_components/QuietTabs";
import { EntityMultiSelect, type MultiSelectOption } from "@/app/season/_components/EntityMultiSelect";
import { RacePodium, type PodiumEntry } from "@/components/raceDetail/RacePodium";
import { RaceResultsTable, type RaceResultRow } from "@/components/raceDetail/RaceResultsTable";
import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import { RaceStorySection } from "@/components/raceDetail/RaceStorySection";
import type { RaceStoryFacts } from "@/components/raceDetail/RaceStory";
import { RaceSubSection } from "@/components/raceDetail/RaceSubSection";
import type { StatTile } from "@/components/raceDetail/StatTiles";
import { useScrollToSection } from "@/hooks/useScrollToSection";
import { filterDriverSet, type DriverSet } from "@/lib/driverSet";
import { formatLapTime } from "@/lib/format";
import { teamColor } from "@/lib/teamColors";
import type { RaceHighlights } from "@/lib/highlights";
import type { PredictionAccuracy, PolePredictionAccuracy } from "@/lib/predictionAccuracy";
import type { RaceDoc, RaceResultEntry } from "@/lib/types/race";
import { ModelInfo } from "./ModelInfo";
import { PoleSection } from "./PoleSection";
import { PolePredictionComparison } from "./PolePredictionComparison";
import { PracticeSummary } from "./PracticeSummary";
import { PredictionComparison } from "./PredictionComparison";
import { PredictionPanel } from "./PredictionPanel";
import { QualifyingGapChart } from "./QualifyingGapChart";
import { SeasonConditionsCard } from "./SeasonConditionsCard";
import { SimulationPanel } from "./SimulationPanel";
import { TireStintTimeline } from "./TireStintTimeline";
import { PositionChangesPanel, type PositionChangeEntry } from "@/components/raceDetail/PositionChangesPanel";
import { LapChart, type LapChartResultEntry } from "@/components/raceDetail/LapChart";
import { useSeasonLaps } from "@/hooks/useSeasonLaps";

// Podium (3) + this many more visible by default - "Show all results" reveals the rest, so a
// 20-car field doesn't turn Results into a wall-length scroll inside its own card.
const INITIAL_RESULT_ROWS = 7;

function toResultRow(r: RaceResultEntry): RaceResultRow {
  return {
    key: r.driver,
    positionText: r.status === "dnf" ? "DNF" : String(r.finishPosition),
    driverName: r.driverName,
    team: r.team,
    statusLabel: r.status === "finished" ? "Finished" : r.status === "lapped" ? "Lapped" : "Retired",
    secondaryLabel: r.status === "finished" && r.finishGapSec !== null ? (r.finishGapSec === 0 ? "Leader" : `+${r.finishGapSec.toFixed(3)}s`) : r.status === "lapped" ? "Lapped" : "–",
    points: r.points,
    fastestLap: false, // overwritten per-race by the caller, which knows the actual fastest time across the field
  };
}

/** The season race page's actual content, as a flowing dashboard of always-visible, individually
 * bounded sections instead of the old tab shell. Practice/Qualifying/Strategy/Race Performance
 * live inside one "Race Analysis" module (RaceSubSection) rather than three separate top-level
 * glass cards - "related modules should feel grouped," not "card, card, card." Each section/
 * sub-section is still gated on exactly the same real-data condition its old tab was. */
export function SeasonRaceDashboard({
  race,
  highlights,
  accuracy,
  poleAccuracy,
  circuitImage,
}: {
  race: RaceDoc;
  highlights: RaceHighlights | null;
  accuracy: PredictionAccuracy | null;
  poleAccuracy: PolePredictionAccuracy | null;
  // Real, not fabricated - see race/page.tsx's findArchiveCircuitByLocation call and
  // SeasonConditionsCard's own comment. Null/undefined for a venue the archive hasn't reached yet.
  circuitImage?: { url: string; wikipediaUrl: string | null } | null;
}) {
  useScrollToSection();
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const [showAllResults, setShowAllResults] = useState(false);
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

  const fastestLapSec = isCompleted && race.results ? Math.min(...race.results.filter((r) => r.fastestLapSec !== null).map((r) => r.fastestLapSec!)) : null;
  const podium: PodiumEntry[] =
    isCompleted && race.results
      ? [...race.results]
          .filter((r) => r.finishPosition <= 3)
          .sort((a, b) => a.finishPosition - b.finishPosition)
          .map((r) => ({
            position: r.finishPosition as 1 | 2 | 3,
            driverName: r.driverName,
            team: r.team,
            // No absolute race-time field on RaceResultEntry, only a gap-to-leader in seconds -
            // "Leader" for P1, "+X.XXXs" otherwise, same convention ResultsTable.tsx already used.
            gapOrTime: r.finishGapSec !== null ? (r.finishGapSec === 0 ? "Leader" : `+${r.finishGapSec.toFixed(3)}s`) : null,
            points: r.points,
          }))
      : [];
  const allResultRows: RaceResultRow[] =
    isCompleted && race.results
      ? [...race.results]
          .filter((r) => r.finishPosition > 3)
          .sort((a, b) => a.finishPosition - b.finishPosition)
          .map((r) => ({ ...toResultRow(r), fastestLap: fastestLapSec !== null && r.fastestLapSec === fastestLapSec }))
      : [];
  const resultRows = showAllResults ? allResultRows : allResultRows.slice(0, INITIAL_RESULT_ROWS);

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

  // Race story + key statistics - both built from the same facts computeHighlights already
  // produces, no new data. Winning margin is P2's own gap-to-leader (the gap-to-leader field *is*
  // the margin, for whoever finished second).
  const winner = isCompleted && race.results ? race.results.find((r) => r.finishPosition === 1) : undefined;
  const storyFacts: RaceStoryFacts | null =
    highlights && winner
      ? {
          winnerName: winner.driverName,
          poleSitterName: race.results?.find((r) => r.driver === highlights.poleSitter)?.driverName ?? highlights.poleSitter,
          fastestLap: highlights.fastestLap
            ? { driverName: race.results?.find((r) => r.driver === highlights.fastestLap!.driver)?.driverName ?? highlights.fastestLap.driver, timeLabel: formatLapTime(highlights.fastestLap.timeSec) }
            : null,
          biggestGainer: highlights.biggestGainer
            ? { driverName: race.results?.find((r) => r.driver === highlights.biggestGainer!.driver)?.driverName ?? highlights.biggestGainer.driver, positionsGained: highlights.biggestGainer.positionsGained }
            : null,
          biggestLoser: highlights.biggestLoser
            ? { driverName: race.results?.find((r) => r.driver === highlights.biggestLoser!.driver)?.driverName ?? highlights.biggestLoser.driver, positionsLost: highlights.biggestLoser.positionsLost }
            : null,
          dnfCount: highlights.dnfs.length,
        }
      : null;
  const winningMarginSec = isCompleted && race.results ? (race.results.find((r) => r.finishPosition === 2)?.finishGapSec ?? null) : null;
  const statTiles: StatTile[] | null = highlights
    ? [
        { label: "Pole position", value: race.results?.find((r) => r.driver === highlights.poleSitter)?.driverName ?? highlights.poleSitter },
        { label: "Fastest lap", value: highlights.fastestLap ? (race.results?.find((r) => r.driver === highlights.fastestLap!.driver)?.driverName ?? highlights.fastestLap.driver) : "–", sub: highlights.fastestLap ? formatLapTime(highlights.fastestLap.timeSec) : undefined },
        { label: "Winning margin", value: winningMarginSec !== null ? `+${winningMarginSec.toFixed(3)}s` : "–" },
        { label: "DNFs", value: String(highlights.dnfs.length) },
      ]
    : null;

  function renderExpanded(key: string) {
    const r = race.results?.find((res) => res.driver === key);
    if (!r) return null;
    const gained = r.grid !== null ? r.grid - r.finishPosition : null;
    return (
      <div className="grid gap-3 border-t border-white/10 px-3 py-2.5 text-sm sm:grid-cols-3">
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Grid → finish</p>
          <p className="text-neutral-300">
            P{r.grid ?? "–"} → P{r.finishPosition}
            {gained !== null && gained !== 0 && <span className={gained > 0 ? "text-emerald-400" : "text-red-400"}> ({gained > 0 ? "+" : ""}{gained})</span>}
          </p>
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Fastest lap</p>
          <p className="text-neutral-300">{r.fastestLapSec !== null ? formatLapTime(r.fastestLapSec) : "–"}</p>
        </div>
        <div>
          <p className="mb-1 text-xs uppercase tracking-wide text-neutral-500">Points</p>
          <p className="text-neutral-300">{r.points}</p>
        </div>
      </div>
    );
  }

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
  const hasSessionAnalysis = hasPractice || hasQualifying || hasStrategy || hasPositionChanges || hasLapChart;
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
  const driverSetFilter =
    Math.max(hasQualifying ? race.inputs!.length : 0, hasStrategy ? race.tireStints!.length : 0, allMovementEntries.length) > 5 ? (
      <div className="flex flex-wrap items-center gap-3">
        <QuietTabs
          options={[
            { value: "top5" as const, label: "Top 5" },
            { value: "top10" as const, label: "Top 10" },
            { value: "all" as const, label: "All drivers" },
            { value: "custom" as const, label: "Custom" },
          ]}
          value={driverSet}
          onChange={setDriverSet}
          className="text-xs"
        />
        {driverSet === "custom" && (
          <EntityMultiSelect options={customSelectOptions} selected={customDriverIds} onChange={setCustomDriverIds} placeholder="Select drivers" triggerClassName="h-8 py-1 text-xs" />
        )}
      </div>
    ) : undefined;

  return (
    <div id="overview" className="space-y-6">
      <RaceStorySection
        storyFacts={storyFacts}
        statTiles={statTiles}
        circuitCard={<SeasonConditionsCard circuit={race.circuit} country={race.country} weather={race.weather} image={circuitImage} />}
      />

      {!isCompleted &&
        (race.prediction ? (
          <RaceSectionCard title="Pre-Race Prediction">
            <PredictionPanel prediction={race.prediction} polePrediction={race.polePrediction} />
          </RaceSectionCard>
        ) : race.polePrediction ? (
          <RaceSectionCard title="Pole Prediction">
            <PoleSection polePrediction={race.polePrediction} />
          </RaceSectionCard>
        ) : (
          <p className="text-sm text-neutral-500">No prior-season history yet to predict from.</p>
        ))}

      {isCompleted && (
        <RaceSectionCard id="results" title="Results">
          <motion.div layout className="space-y-3">
            <RacePodium entries={podium} />
            {resultRows.length > 0 && (
              <RaceResultsTable rows={resultRows} renderExpanded={renderExpanded} expandedKey={expandedKey} onToggleExpand={(k) => setExpandedKey((p) => (p === k ? null : k))} />
            )}
            {allResultRows.length > INITIAL_RESULT_ROWS && (
              <button
                type="button"
                onClick={() => setShowAllResults((v) => !v)}
                className="mx-auto block text-sm text-neutral-400 transition hover:text-white"
              >
                {showAllResults ? "Show fewer results ↑" : `Show all results (+${allResultRows.length - INITIAL_RESULT_ROWS}) ↓`}
              </button>
            )}
          </motion.div>
        </RaceSectionCard>
      )}

      {hasSessionAnalysis && (
        <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
          <RaceSectionCard
            title="Race Analysis"
            description="Grid position, qualifying pace, race strategy, lap progression and finishing performance."
            headerRight={driverSetFilter}
          >
            {hasPractice && (
              <RaceSubSection label="Practice" first>
                {/* Merged, not `inputs ?? results` - confirmed live that race_inputs can be a few
                    drivers short of the full field (grid data landing before every driver's row
                    does) while race_results already has everyone, so picking just one source
                    whole would silently drop a practice row's tooltip for whoever inputs is
                    missing. Same driver in both resolves to the same name/team either way. */}
                <PracticeSummary practice={race.practice!} roster={[...(race.inputs ?? []), ...(race.results ?? [])]} />
              </RaceSubSection>
            )}
            {/* Qualifying and Strategy share a row - they're the two panels that genuinely
                benefit from sitting side by side at a comparable width. Lap Progression needs
                real horizontal room to read a whole field's trajectories, and Race Performance
                reads best as one full-width comparison strip - forcing either into a second
                column here is exactly the cramped, dead-space-heavy layout this redesign
                replaces, so both get their own full-width row below instead. */}
            {(hasQualifying || hasStrategy) && (
              <div className={hasPractice ? "mt-6 border-t border-[var(--f1-line)] pt-6" : ""}>
                <div className={hasQualifying && hasStrategy ? "grid items-start gap-x-8 gap-y-6 lg:grid-cols-2" : undefined}>
                  {hasQualifying && (
                    <div id="qualifying" className={hasStrategy ? "min-w-0 border-b border-[var(--f1-line)] pb-6 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-8" : "min-w-0"}>
                      <RaceSubSection label="Qualifying" description="Gap to pole position across classified drivers." first>
                        <QualifyingGapChart inputs={race.inputs!} driverSet={driverSet} customIds={customDriverIds} />
                      </RaceSubSection>
                    </div>
                  )}
                  {hasStrategy && (
                    <div id="strategy" className="min-w-0">
                      <RaceSubSection label="Strategy" description="Tyre compounds and stint lengths across the race." first>
                        <TireStintTimeline stints={race.tireStints!} results={race.results ?? []} driverSet={driverSet} customIds={customDriverIds} />
                      </RaceSubSection>
                    </div>
                  )}
                </div>
              </div>
            )}
            {hasLapChart && (
              <div id="lap-chart" className={hasPractice || hasQualifying || hasStrategy ? "mt-6 border-t border-[var(--f1-line)] pt-6" : ""}>
                <RaceSubSection label="Lap Progression" description="Race position changes lap by lap." first>
                  <LapChart laps={laps} isLoading={lapsLoading} isError={lapsError} results={lapChartResults} driverSet={driverSet} customIds={customDriverIds} />
                </RaceSubSection>
              </div>
            )}
            {hasPositionChanges && (
              <div id="race-performance" className={hasPractice || hasQualifying || hasStrategy || hasLapChart ? "mt-6 border-t border-[var(--f1-line)] pt-6" : ""}>
                <RaceSubSection label="Race Performance" description="Starting grid position compared with finishing position." first>
                  <PositionChangesPanel entries={visibleMovementEntries} fieldSize={fieldSize} />
                </RaceSubSection>
              </div>
            )}
          </RaceSectionCard>
        </motion.div>
      )}

      {hasAnalysis && (
        <RaceSectionCard title="Prediction Accuracy">
          <div className="space-y-6">
            {(accuracy || poleAccuracy) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {accuracy && <PredictionComparison accuracy={accuracy} />}
                {poleAccuracy && <PolePredictionComparison accuracy={poleAccuracy} />}
              </div>
            )}
            {(race.prediction || race.polePrediction) && <ModelInfo />}
          </div>
        </RaceSectionCard>
      )}

      {race.simulation && (
        <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
          <RaceSectionCard
            id="simulation"
            title="Simulation"
            description="Monte Carlo projection based on grid position, race pace and DNF probability."
            headerRight={<span className="text-xs text-neutral-500">Based on 10,000 simulations</span>}
          >
            <SimulationPanel simulation={race.simulation} />
          </RaceSectionCard>
        </motion.div>
      )}
    </div>
  );
}
