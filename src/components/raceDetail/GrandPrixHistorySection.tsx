"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { RaceSectionCard } from "./RaceSectionCard";
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
 * track, each its own real event with its own real record) - this section is scoped to the exact
 * Grand Prix identity this race is actually running under (`raceName`), filtered out of the
 * circuit's full timeline via filterByRaceName, never the circuit's combined history mislabeled as
 * this one event's.
 *
 * Shown for every race phase, not gated on completion - "who's won this race before" is exactly as
 * true and exactly as useful before a race weekend as after one.
 *
 * Renders nothing (not an empty card) when this circuit has no real recorded history for this
 * exact Grand Prix identity yet - a genuinely new event, or one whose archive match failed.
 */
export function GrandPrixHistorySection({ raceName, timeline }: { raceName: string; timeline: CircuitYearRecord[] }) {
  const [expanded, setExpanded] = useState(false);
  if (timeline.length === 0) return null;

  const allNames = distinctRaceNames(timeline);
  // Only worth filtering (and only worth the explanatory note below) when this circuit has
  // genuinely hosted more than one Grand Prix identity - the overwhelmingly common case (one
  // venue, one event, always) has nothing to distinguish and no note to show.
  const gpTimeline = allNames.length > 1 ? filterByRaceName(timeline, raceName) : timeline;
  if (gpTimeline.length === 0) return null;

  const records = computeTrackRecords(gpTimeline);
  const mostRecent = gpTimeline[0];
  const previousRunning = gpTimeline[1] ?? null;
  const oldestYear = gpTimeline[gpTimeline.length - 1].year;
  const rowsShown = expanded ? gpTimeline : gpTimeline.slice(0, YEARS_SHOWN_COLLAPSED);

  return (
    <motion.div initial={{ opacity: 0, y: 8 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.3, ease: "easeOut" }}>
      <RaceSectionCard title="Grand Prix History" description={`${raceName} has been run ${gpTimeline.length} time${gpTimeline.length === 1 ? "" : "s"}, since ${oldestYear}.`}>
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
      </RaceSectionCard>
    </motion.div>
  );
}
