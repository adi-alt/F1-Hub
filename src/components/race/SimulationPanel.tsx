"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { SimulationChart } from "@/components/charts/SimulationChart";
import type { RaceSimulation, SimulatedDriverEntry } from "@/lib/types/race";

// Compact default (a 20-driver field's full Win/Podium/Expected-finish lists is exactly the
// "~80 rows total" density complaint) - each block shows this many, with its own "Show all"
// below, rather than a full tab system for what's really one gate per block.
const COMPACT_ROWS = 5;

/** One ranked row: label, a proportional bar (scaled against the top entry, not a fixed 0-100
 * scale - so the closest race reads as close, not everyone maxed out), and the real percentage.
 * Same numbers `p1`/`podium` already had as plain text before - just visualized as a ranked bar
 * list, matching "ranked horizontal visualization" rather than fabricating anything new.
 * `barColor` differentiates Win from Podium (two adjacent bar lists in the same red would read as
 * one repeated chart, not two distinct signals). */
function ProbabilityBars({ label, entries, barColor }: { label: string; entries: { driver: string; pct: number }[]; barColor: string }) {
  const [showAll, setShowAll] = useState(false);
  const max = Math.max(...entries.map((e) => e.pct), 0.01);
  const shown = showAll ? entries : entries.slice(0, COMPACT_ROWS);
  return (
    <div>
      <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{label}</p>
      <div className="space-y-1.5">
        {shown.map((e, i) => (
          <div key={e.driver} className="flex items-center gap-3">
            <span className="w-8 shrink-0 text-right font-mono text-xs text-neutral-600">{i + 1}.</span>
            <span className="w-16 shrink-0 truncate text-sm font-medium text-white">{e.driver}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full rounded-full"
                initial={{ width: 0 }}
                animate={{ width: `${(e.pct / max) * 100}%` }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                style={{ background: barColor }}
              />
            </div>
            <span className="w-12 shrink-0 text-right font-mono text-sm tabular-nums text-white">{e.pct.toFixed(0)}%</span>
          </div>
        ))}
      </div>
      {entries.length > COMPACT_ROWS && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs text-neutral-500 transition hover:text-white">
          {showAll ? "Show fewer ↑" : `Show all ${entries.length} ↓`}
        </button>
      )}
    </div>
  );
}

function byDesc(key: "p1" | "podium") {
  return (a: SimulatedDriverEntry, b: SimulatedDriverEntry) => b[key] - a[key];
}

export function SimulationPanel({ simulation }: { simulation: RaceSimulation }) {
  const [showAllFinish, setShowAllFinish] = useState(false);
  const byMedian = [...simulation.drivers].sort((a, b) => a.medianPosition - b.medianPosition);
  const byWin = [...simulation.drivers].sort(byDesc("p1"));
  const byPodium = [...simulation.drivers].sort(byDesc("podium"));
  const shownFinish = showAllFinish ? byMedian : byMedian.slice(0, COMPACT_ROWS);

  return (
    <div className="space-y-8">
      <p className="text-xs text-neutral-500">Based on a 10,000-race Monte Carlo simulation of grid position, pace, and DNF probability.</p>

      <div className="grid gap-8 sm:grid-cols-2">
        <ProbabilityBars
          label="Win probability"
          entries={byWin.map((d) => ({ driver: d.driver, pct: d.p1 * 100 }))}
          barColor="linear-gradient(90deg, rgba(225,6,0,0.55), var(--f1-red))"
        />
        <ProbabilityBars
          label="Podium probability"
          entries={byPodium.map((d) => ({ driver: d.driver, pct: d.podium * 100 }))}
          barColor="linear-gradient(90deg, rgba(59,130,214,0.55), #7fb3ec)"
        />
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Expected finish</p>
        {/* Plain divided rows, not boxed cards - same "row, not card" language as the Championship
            table and RaceResultsTable (border-b instead of a rounded, bordered background per item). */}
        <ol className="grid gap-x-8 sm:grid-cols-2">
          {shownFinish.map((entry, index) => (
            <li key={entry.driver} className="flex items-center justify-between border-b border-[var(--f1-line)] py-2">
              <span className="font-semibold text-white">
                {index + 1}. {entry.driver}
              </span>
              <span className="font-mono text-sm tabular-nums text-neutral-400">median P{entry.medianPosition}</span>
            </li>
          ))}
        </ol>
        {byMedian.length > COMPACT_ROWS && (
          <button type="button" onClick={() => setShowAllFinish((v) => !v)} className="mt-3 text-xs text-neutral-500 transition hover:text-white">
            {showAllFinish ? "Show fewer ↑" : `Show all ${byMedian.length} ↓`}
          </button>
        )}
      </div>

      <div>
        <p className="mb-3 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Finishing-position distribution</p>
        <SimulationChart drivers={simulation.drivers} />
      </div>
    </div>
  );
}
