"use client";

import { RaceTabShell, type RaceTab } from "@/components/raceDetail/RaceTabShell";
import { RacePodium, type PodiumEntry } from "@/components/raceDetail/RacePodium";
import { RaceResultsTable, type RaceResultRow } from "@/components/raceDetail/RaceResultsTable";
import { useUrlParam } from "@/hooks/useUrlParam";
import { circuitHref } from "@/lib/routes";
import type { RaceHighlights } from "@/lib/highlights";
import type { PredictionAccuracy, PolePredictionAccuracy } from "@/lib/predictionAccuracy";
import type { RaceDoc, RaceResultEntry } from "@/lib/types/race";
import { HighlightsPanel } from "./HighlightsPanel";
import { ModelInfo } from "./ModelInfo";
import { PoleSection } from "./PoleSection";
import { PolePredictionComparison } from "./PolePredictionComparison";
import { PracticeSummary } from "./PracticeSummary";
import { PredictionComparison } from "./PredictionComparison";
import { PredictionPanel } from "./PredictionPanel";
import { QualifyingTable } from "./QualifyingTable";
import { SimulationPanel } from "./SimulationPanel";
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
 * the current season only, never fabricated). Strategy shows tire stints when they exist; there's
 * no dedicated component for that yet (the old /races page never rendered them either), so it's a
 * small inline list here rather than a whole new file for ~15 lines of markup. */
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

  return (
    <RaceTabShell tabs={tabs} active={activeTab} onChange={setTab}>
      {activeTab === "overview" && (
        <div className="space-y-6">
          {race.practice && <PracticeSummary practice={race.practice} />}
          {isCompleted && highlights && <HighlightsPanel highlights={highlights} />}
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
          {resultRows.length > 0 && <RaceResultsTable rows={resultRows} />}
        </div>
      )}

      {activeTab === "qualifying" && race.inputs && <QualifyingTable inputs={race.inputs} />}

      {activeTab === "strategy" && race.tireStints && <TireStintsList stints={race.tireStints} />}

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

function TireStintsList({ stints }: { stints: NonNullable<RaceDoc["tireStints"]> }) {
  const byDriver = new Map<string, typeof stints>();
  for (const s of stints) {
    const list = byDriver.get(s.driver) ?? [];
    list.push(s);
    byDriver.set(s.driver, list);
  }
  return (
    <div className="space-y-2">
      {[...byDriver.entries()].map(([driver, driverStints]) => (
        <div key={driver} className="flex items-center gap-3 rounded-lg border-l-[3px] border-l-white/20 bg-[var(--f1-carbon)]/60 px-3 py-2">
          <span className="w-14 shrink-0 text-sm font-medium text-white">{driver}</span>
          <div className="flex flex-1 flex-wrap gap-1.5">
            {[...driverStints]
              .sort((a, b) => a.stintNumber - b.stintNumber)
              .map((s) => (
                <span key={s.stintNumber} className="rounded bg-white/[0.06] px-2 py-0.5 text-xs text-neutral-300">
                  {s.compound} · {s.lapCount} laps
                </span>
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}
