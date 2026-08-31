"use client";

import { useState } from "react";
import { RaceTabShell, type RaceTab } from "@/components/raceDetail/RaceTabShell";
import { RacePodium, type PodiumEntry } from "@/components/raceDetail/RacePodium";
import { RaceResultsTable, type RaceResultRow } from "@/components/raceDetail/RaceResultsTable";
import { RaceStory, type RaceStoryFacts } from "@/components/raceDetail/RaceStory";
import { StatTiles, type StatTile } from "@/components/raceDetail/StatTiles";
import { useUrlParam } from "@/hooks/useUrlParam";
import { formatLapTime } from "@/lib/format";
import { circuitHref } from "@/lib/routes";
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
import { SimulationPanel } from "./SimulationPanel";
import { TireStintTimeline } from "./TireStintTimeline";
import { MovementChart } from "@/components/charts/MovementChart";
import Link from "next/link";

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

/** Season's own tab set - one Simulation tab more than Archive's, and only when this specific
 * race actually has one (race.simulation - see the plan's own data-reality note: this is real for
 * the current season only, never fabricated). */
export function SeasonRaceTabs({
  race,
  highlights,
  accuracy,
  poleAccuracy,
}: {
  race: RaceDoc;
  highlights: RaceHighlights | null;
  accuracy: PredictionAccuracy | null;
  poleAccuracy: PolePredictionAccuracy | null;
}) {
  const [tab, setTab] = useUrlParam("tab", "overview");
  const [expandedKey, setExpandedKey] = useState<string | null>(null);
  const isCompleted = race.status === "completed" && !!race.results;

  const tabs: RaceTab[] = [
    { key: "overview", label: "Overview" },
    ...(isCompleted ? [{ key: "results", label: "Results" }] : []),
    ...(race.inputs?.length ? [{ key: "qualifying", label: "Qualifying" }] : []),
    ...(race.tireStints?.length ? [{ key: "strategy", label: "Strategy" }] : []),
    ...(isCompleted || race.prediction || race.polePrediction ? [{ key: "analysis", label: "Analysis" }] : []),
    ...(race.simulation ? [{ key: "simulation", label: "Simulation" }] : []),
  ];
  const activeTab = tabs.some((t) => t.key === tab) ? tab : "overview";

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
  const resultRows: RaceResultRow[] =
    isCompleted && race.results
      ? [...race.results]
          .filter((r) => r.finishPosition > 3)
          .sort((a, b) => a.finishPosition - b.finishPosition)
          .map((r) => ({ ...toResultRow(r), fastestLap: fastestLapSec !== null && r.fastestLapSec === fastestLapSec }))
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

  return (
    <RaceTabShell tabs={tabs} active={activeTab} onChange={setTab}>
      {activeTab === "overview" && (
        <div className="space-y-6">
          {storyFacts && <RaceStory facts={storyFacts} />}
          {statTiles && <StatTiles tiles={statTiles} />}
          {race.practice && <PracticeSummary practice={race.practice} />}
          {!isCompleted &&
            (race.prediction ? (
              <PredictionPanel prediction={race.prediction} polePrediction={race.polePrediction} />
            ) : race.polePrediction ? (
              <PoleSection polePrediction={race.polePrediction} />
            ) : (
              <p className="text-sm text-neutral-500">No prior-season history yet to predict from.</p>
            ))}
          <Link href={circuitHref(race.circuit)} className="inline-block text-sm text-neutral-500 transition hover:text-neutral-300">
            Track history →
          </Link>
        </div>
      )}

      {activeTab === "results" && (
        <div className="space-y-6">
          <RacePodium entries={podium} />
          {resultRows.length > 0 && (
            <RaceResultsTable rows={resultRows} renderExpanded={renderExpanded} expandedKey={expandedKey} onToggleExpand={(k) => setExpandedKey((p) => (p === k ? null : k))} />
          )}
        </div>
      )}

      {activeTab === "qualifying" && race.inputs && <QualifyingGapChart inputs={race.inputs} />}

      {activeTab === "strategy" && race.tireStints && <TireStintTimeline stints={race.tireStints} />}

      {activeTab === "analysis" && (
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
      )}

      {activeTab === "simulation" && race.simulation && <SimulationPanel simulation={race.simulation} />}
    </RaceTabShell>
  );
}
