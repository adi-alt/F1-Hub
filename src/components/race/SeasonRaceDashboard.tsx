"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { RacePodium, type PodiumEntry } from "@/components/raceDetail/RacePodium";
import { RaceResultsTable, type RaceResultRow } from "@/components/raceDetail/RaceResultsTable";
import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import { RaceStory, type RaceStoryFacts } from "@/components/raceDetail/RaceStory";
import { RaceSubSection } from "@/components/raceDetail/RaceSubSection";
import { StatTiles, type StatTile } from "@/components/raceDetail/StatTiles";
import { useScrollToSection } from "@/hooks/useScrollToSection";
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
import { MovementChart } from "@/components/charts/MovementChart";

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
 * bounded sections instead of the old tab shell. Practice/Qualifying/Strategy live inside one
 * "Session Analysis" module (RaceSubSection) rather than three separate top-level glass cards -
 * "related modules should feel grouped," not "card, card, card." Each section/sub-section is
 * still gated on exactly the same real-data condition its old tab was. */
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

  const hasAnalysis = isCompleted || !!accuracy || !!poleAccuracy;
  const hasPractice = !!race.practice;
  const hasQualifying = !!race.inputs?.length;
  const hasStrategy = !!race.tireStints?.length;
  const hasSessionAnalysis = hasPractice || hasQualifying || hasStrategy;
  const sessionAnalysisSideBySide = hasQualifying && hasStrategy;

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
        <RaceSectionCard title="Session Analysis">
          {hasPractice && (
            <RaceSubSection label="Practice" first>
              <PracticeSummary practice={race.practice!} />
            </RaceSubSection>
          )}
          {(hasQualifying || hasStrategy) && (
            <div className={hasPractice ? "mt-8 border-t border-[var(--f1-line)] pt-8" : ""}>
              <div className={sessionAnalysisSideBySide ? "grid items-start gap-12 lg:grid-cols-2" : undefined}>
                {hasQualifying && (
                  // No height cap - Qualifying always shows the full field regardless of what
                  // Strategy's own Top 5/10/All is set to, so it's very often the taller of the
                  // two. That's real content, not wasted space - items-start (above) is what lets
                  // Strategy stay its own natural (often shorter) height instead of both being
                  // forced to match. Divider only when Strategy also exists.
                  <div id="qualifying" className={sessionAnalysisSideBySide ? "border-b border-[var(--f1-line)] pb-8 lg:border-b-0 lg:border-r lg:pb-0 lg:pr-12" : undefined}>
                    <RaceSubSection label="Qualifying" first>
                      <QualifyingGapChart inputs={race.inputs!} />
                    </RaceSubSection>
                  </div>
                )}
                {hasStrategy && (
                  <div id="strategy">
                    {/* `first` unconditionally - Qualifying/Strategy either sit side by side (a
                        grid, no "above" content on either side) or this is the only one in the
                        block, never a second item stacked below the other. */}
                    <RaceSubSection label="Strategy" first>
                      <TireStintTimeline stints={race.tireStints!} results={race.results ?? []} />
                    </RaceSubSection>
                  </div>
                )}
              </div>
            </div>
          )}
        </RaceSectionCard>
      )}

      {hasAnalysis && (
        <RaceSectionCard id="analysis" title="Race Analysis" description="Grid position vs. finishing position for every classified driver.">
          <div className="space-y-8">
            {(accuracy || poleAccuracy) && (
              <div className="grid gap-4 sm:grid-cols-2">
                {accuracy && <PredictionComparison accuracy={accuracy} />}
                {poleAccuracy && <PolePredictionComparison accuracy={poleAccuracy} />}
              </div>
            )}
            {isCompleted && race.results && <MovementChart results={race.results} />}
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
