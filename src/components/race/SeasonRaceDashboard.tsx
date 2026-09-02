"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { QuietTabs } from "@/app/season/_components/QuietTabs";
import { RacePodium, type PodiumEntry } from "@/components/raceDetail/RacePodium";
import { RaceResultsTable, type RaceResultRow } from "@/components/raceDetail/RaceResultsTable";
import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import { RaceStory, type RaceStoryFacts } from "@/components/raceDetail/RaceStory";
import { RaceSubSection } from "@/components/raceDetail/RaceSubSection";
import { StatTiles, type StatTile } from "@/components/raceDetail/StatTiles";
import { useScrollToSection } from "@/hooks/useScrollToSection";
import type { DriverSet } from "@/lib/driverSet";
import { formatLapTime } from "@/lib/format";
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
  // The merged left column can show either the grid->finish rows or the existing gap-to-pole
  // chart - a separate, local toggle from driverSet above (this picks which visualization, not
  // how many drivers). Defaults to the compact rows view.
  const [qualifyingView, setQualifyingView] = useState<"performance" | "qualifying">("performance");
  const isCompleted = race.status === "completed" && !!race.results;

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

  // Same real grid/finish data the old full-width MovementChart plotted, now feeding the compact
  // Position Changes column instead - same filtering convention that chart already used (DNFs and
  // zero-movement drivers excluded, biggest gainer first).
  const allMovementEntries: PositionChangeEntry[] =
    isCompleted && race.results
      ? race.results
          .filter((r) => r.status !== "dnf" && r.grid !== null)
          .map((r) => ({ code: r.driver, grid: r.grid!, finish: r.finishPosition, movement: r.grid! - r.finishPosition }))
          .filter((e) => e.movement !== 0)
          .sort((a, b) => b.movement - a.movement)
      : [];

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
  const hasSessionAnalysis = hasPractice || hasQualifying || hasStrategy || hasPositionChanges;
  // Qualifying and Position Changes share one column (a local toggle, not a separate column) -
  // side by side with Strategy only when Strategy also has real data, otherwise this stacks like
  // every other single-column case already does.
  const raceAnalysisSideBySide = (hasQualifying || hasPositionChanges) && hasStrategy;
  const visibleMovementEntries = driverSet === "all" ? allMovementEntries : allMovementEntries.slice(0, driverSet === "top5" ? 5 : 10);
  // Nothing left to filter down to for a field of 5 or fewer. Governs Qualifying, Strategy, and
  // Position Changes together - one control for the whole section, not each panel's own.
  const driverSetFilter =
    Math.max(hasQualifying ? race.inputs!.length : 0, hasStrategy ? race.tireStints!.length : 0, allMovementEntries.length) > 5 ? (
      <QuietTabs
        options={[
          { value: "top5" as const, label: "Top 5" },
          { value: "top10" as const, label: "Top 10" },
          { value: "all" as const, label: "All drivers" },
        ]}
        value={driverSet}
        onChange={setDriverSet}
        className="text-xs"
      />
    ) : undefined;

  return (
    <div id="overview" className="space-y-8">
      <section className="surface-inset rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-5 sm:p-6">
        {/* "Race Overview" lives inside the left column (not as a sibling above the grid) so that
            column's own top - not "Race Story"'s - is what items-start aligns the Circuit column
            against. The Circuit column is almost always shorter than the left column overall, and
            items-start (not the grid default, stretch) is what stops its own bordered box from
            growing to match and leaving a dead gap at its own bottom. */}
        <div className="grid items-start gap-6 lg:grid-cols-[1fr_20rem]">
          <div className="space-y-4">
            <p className="text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Race Overview</p>
            {storyFacts && <RaceStory facts={storyFacts} />}
            {statTiles && <StatTiles tiles={statTiles} />}
          </div>
          <SeasonConditionsCard circuit={race.circuit} country={race.country} weather={race.weather} image={circuitImage} />
        </div>
      </section>

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
          <motion.div layout className="space-y-4">
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
        <RaceSectionCard title="Race Analysis" description="Grid position, finishing position and race strategy.">
          {hasPractice && (
            <RaceSubSection label="Practice" first>
              <PracticeSummary practice={race.practice!} />
            </RaceSubSection>
          )}
          {(hasQualifying || hasStrategy || hasPositionChanges) && (
            <div className={hasPractice ? "mt-8 border-t border-[var(--f1-line)] pt-8" : ""}>
              {/* Shared Top 5/10/All - governs Qualifying, Strategy, and Race Performance
                  together. Right-aligned above this specific two-column area, not the whole Race
                  Analysis card - Practice above has no such filter, so putting it up there would
                  visually suggest it governs Practice too. */}
              {driverSetFilter && <div className="mb-6 flex justify-end">{driverSetFilter}</div>}
              {/* 1fr/1.15fr, not an even split - Strategy's tyre-stint bars need more horizontal
                  room than the merged left column's narrower row shapes. */}
              <div className={raceAnalysisSideBySide ? "grid items-start gap-x-10 gap-y-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]" : undefined}>
                {(hasQualifying || hasPositionChanges) && (
                  <div id="qualifying" className={raceAnalysisSideBySide ? "min-w-0 border-b border-[var(--f1-line)] pb-8 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-10" : "min-w-0"}>
                    {hasQualifying && hasPositionChanges ? (
                      // Both real, both worth keeping - a local toggle (not the shared driverSet
                      // filter above) switches which one this column shows, defaulting to the
                      // compact grid->finish rows rather than permanently discarding the
                      // gap-to-pole chart in favor of it.
                      <RaceSubSection
                        label="Qualifying"
                        first
                        headerRight={
                          <QuietTabs
                            options={[
                              { value: "performance" as const, label: "Race Performance" },
                              { value: "qualifying" as const, label: "Qualifying" },
                            ]}
                            value={qualifyingView}
                            onChange={setQualifyingView}
                            className="text-xs"
                          />
                        }
                      >
                        {qualifyingView === "performance" ? (
                          <PositionChangesPanel entries={visibleMovementEntries} />
                        ) : (
                          <QualifyingGapChart inputs={race.inputs!} driverSet={driverSet} />
                        )}
                      </RaceSubSection>
                    ) : hasQualifying ? (
                      <RaceSubSection label="Qualifying" first>
                        <QualifyingGapChart inputs={race.inputs!} driverSet={driverSet} />
                      </RaceSubSection>
                    ) : (
                      <RaceSubSection label="Race Performance" first>
                        <PositionChangesPanel entries={visibleMovementEntries} />
                      </RaceSubSection>
                    )}
                  </div>
                )}
                {hasStrategy && (
                  <div id="strategy" className="min-w-0">
                    <RaceSubSection label="Strategy" first>
                      <TireStintTimeline stints={race.tireStints!} results={race.results ?? []} driverSet={driverSet} />
                    </RaceSubSection>
                  </div>
                )}
              </div>
            </div>
          )}
        </RaceSectionCard>
      )}

      {hasAnalysis && (
        <RaceSectionCard title="Prediction Accuracy">
          <div className="space-y-8">
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
        <RaceSectionCard id="simulation" title="Simulation">
          <SimulationPanel simulation={race.simulation} />
        </RaceSectionCard>
      )}
    </div>
  );
}
