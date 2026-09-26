"use client";

import { useState } from "react";
import { distinctRaceNames, filterByRaceName, computeTrackRecords, joinNames, type CircuitYearRecord } from "@/lib/circuitIntelligence";

const YEARS_SHOWN_COLLAPSED = 8;

function FactRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-4 border-b border-white/[0.05] py-1.5 text-sm last:border-b-0">
      <span className="text-neutral-500">{label}</span>
      <span className="text-right font-medium text-neutral-200">{value}</span>
    </div>
  );
}

/**
 * The Grand Prix's own history - not the circuit's. Those are two different things a physical
 * venue can conflate (Imola: San Marino GP, Italian GP and Emilia Romagna GP all at the same
 * track, each its own real event with its own real record) - this is scoped to the exact Grand
 * Prix identity this race is actually running under (`raceName`), filtered out of the circuit's
 * full timeline via filterByRaceName, never the circuit's combined history mislabeled as this one
 * event's.
 *
 * A bare content component, not its own section - RaceHistorySection hosts this and
 * CircuitRecordsContent under one shared card and a Winners/Records tab, so "who's won this race"
 * and "the circuit's all-time records" read as two views of one explorer instead of two
 * back-to-back cards repeating the same visual shape.
 *
 * Renders nothing when this circuit has no real recorded history for this exact Grand Prix
 * identity yet - a genuinely new event, or one whose archive match failed. The caller (
 * RaceHistorySection) checks this before even offering the Winners tab.
 */
export function GrandPrixHistoryContent({ raceName, timeline }: { raceName: string; timeline: CircuitYearRecord[] }) {
  const [expanded, setExpanded] = useState(false);
  if (timeline.length === 0) return null;

  const allNames = distinctRaceNames(timeline);
  // Always filtered by the actual race name, never conditionally skipped. The previous version
  // only filtered "when this circuit has hosted more than one identity" - which silently assumed
  // that a circuit with exactly one distinct recorded name must be THIS race's own, even when it
  // provably wasn't (a caught bug: a circuit whose only recorded history was "San Marino Grand
  // Prix" read as real history for "Emilia Romagna Grand Prix" just because no OTHER name was on
  // record). filterByRaceName is unconditional now for exactly that reason.
  const gpTimeline = filterByRaceName(timeline, raceName);
  if (gpTimeline.length === 0) return null;

  const records = computeTrackRecords(gpTimeline);
  const mostRecent = gpTimeline[0];
  const previousRunning = gpTimeline[1] ?? null;
  const oldestYear = gpTimeline[gpTimeline.length - 1].year;
  const rowsShown = expanded ? gpTimeline : gpTimeline.slice(0, YEARS_SHOWN_COLLAPSED);

  return (
    <div>
      <p className="mb-4 text-sm text-neutral-500">
        {raceName} has been run {gpTimeline.length} time{gpTimeline.length === 1 ? "" : "s"}, since {oldestYear}.
      </p>
      {allNames.length > 1 && (
        <p className="mb-4 rounded-lg border border-white/[0.06] bg-white/[0.02] px-3 py-2 text-xs leading-relaxed text-neutral-500">
          This circuit has hosted {allNames.length} different Grand Prix events over its history ({allNames.join(", ")}) - the records below are {raceName}&apos;s own, not the circuit&apos;s combined
          history.
        </p>
      )}
      <div className="grid gap-6 lg:grid-cols-2">
        <div>
          {records.mostWins && <FactRow label="Most wins" value={`${joinNames(records.mostWins.drivers)} (${records.mostWins.count})`} />}
          {records.mostPoles && <FactRow label="Most poles" value={`${joinNames(records.mostPoles.drivers)} (${records.mostPoles.count})`} />}
          {mostRecent.winnerDriver && <FactRow label="Most recent winner" value={`${mostRecent.winnerDriver} (${mostRecent.year})`} />}
          {previousRunning?.winnerDriver && <FactRow label="Previous winner" value={`${previousRunning.winnerDriver} (${previousRunning.year})`} />}
          {!records.mostWins && !mostRecent.winnerDriver && <p className="text-sm text-neutral-500">No classified results recorded for this event yet.</p>}
        </div>

        <div>
          <p className="mb-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Year by year</p>
          <div className="space-y-1">
            {rowsShown.map((r) => (
              <div key={r.year} className="flex items-center justify-between gap-3 text-sm">
                <span className="w-12 shrink-0 font-mono text-neutral-500">{r.year}</span>
                <span className="min-w-0 flex-1 truncate text-neutral-200">{r.winnerDriver ?? "—"}</span>
                <span className="shrink-0 truncate text-xs text-neutral-500">{r.winnerTeam ?? ""}</span>
              </div>
            ))}
          </div>
          {gpTimeline.length > YEARS_SHOWN_COLLAPSED && (
            <button type="button" onClick={() => setExpanded((v) => !v)} className="mt-2 text-xs font-medium text-neutral-400 transition hover:text-white">
              {expanded ? "Show fewer years ↑" : `Show all ${gpTimeline.length} years ↓`}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

/** Whether GrandPrixHistoryContent would render anything real - the same emptiness check its own
 * body makes, exposed so RaceHistorySection can decide whether the Winners tab exists at all
 * without rendering the content twice. */
export function hasGrandPrixHistory(raceName: string, timeline: CircuitYearRecord[]): boolean {
  if (timeline.length === 0) return false;
  return filterByRaceName(timeline, raceName).length > 0;
}
