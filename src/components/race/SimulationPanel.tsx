"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { EntityMultiSelect, type MultiSelectOption } from "@/app/season/_components/EntityMultiSelect";
import { QuietTabs } from "@/app/season/_components/QuietTabs";
import { RaceSubSection } from "@/components/raceDetail/RaceSubSection";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import { staggerContainer, staggerItem } from "@/components/motion/variants";
import { filterDriverSet, type DriverSet } from "@/lib/driverSet";
import type { RaceSimulation, SimulatedDriverEntry } from "@/lib/types/race";

// Compact default (a 20-driver field's full Win/Podium/Expected-finish lists is exactly the
// "~80 rows total" density complaint) - each block shows this many, with its own "View all" below.
const COMPACT_ROWS = 5;
const DIST_ROW_HEIGHT = 28;

/** One ranked row: rank (subtle), driver (stronger weight), a proportional bar (scaled against the
 * top entry, not a fixed 0-100 scale - so the closest race reads as close, not everyone maxed out),
 * and the real percentage. scaleX + transformOrigin left, not an animated `width` - the same
 * "don't animate through layout" reasoning already applied to Strategy's stint bars and Race
 * Performance's connecting line. */
function ProbabilityBars({ label, entries, barColor }: { label: string; entries: { driver: string; pct: number }[]; barColor: string }) {
  const [showAll, setShowAll] = useState(false);
  const max = Math.max(...entries.map((e) => e.pct), 0.01);
  const shown = showAll ? entries : entries.slice(0, COMPACT_ROWS);
  return (
    // `layout` - "View all" changes the row count, so this animates the height instead of the
    // list snapping open instantly.
    <motion.div layout>
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">{label}</p>
      <AnimatePresence initial={false}>
        {shown.map((e, i) => (
          <motion.div
            key={e.driver}
            layout
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, delay: i * 0.02 }}
            className="flex items-center gap-2.5 py-[3px]"
          >
            <span className="w-4 shrink-0 text-right font-mono text-[11px] text-neutral-600">{i + 1}</span>
            <span className="w-12 shrink-0 truncate text-sm font-medium text-white">{e.driver}</span>
            <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
              <motion.div
                className="h-full w-full origin-left rounded-full"
                initial={{ scaleX: 0 }}
                animate={{ scaleX: e.pct / max }}
                transition={{ duration: 0.4, ease: "easeOut" }}
                style={{ background: barColor }}
              />
            </div>
            <span className="w-9 shrink-0 text-right font-mono text-sm tabular-nums text-white">{e.pct.toFixed(0)}%</span>
          </motion.div>
        ))}
      </AnimatePresence>
      {entries.length > COMPACT_ROWS && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs text-neutral-500 transition hover:text-white">
          {showAll ? "Show fewer ↑" : "View all →"}
        </button>
      )}
    </motion.div>
  );
}

/** Same compact-ranked-list shape as ProbabilityBars (rank, driver, one value) but no bar - the
 * finishing position is already a single, directly-comparable number, not a proportion of a whole
 * that benefits from a visual bar the way a probability does. */
function ExpectedFinishList({ entries }: { entries: SimulatedDriverEntry[] }) {
  const [showAll, setShowAll] = useState(false);
  const shown = showAll ? entries : entries.slice(0, COMPACT_ROWS);
  return (
    <motion.div layout>
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Expected finish</p>
      <AnimatePresence initial={false}>
        {shown.map((entry, i) => (
          <motion.div
            key={entry.driver}
            layout
            initial={{ opacity: 0, x: -6 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2, delay: i * 0.02 }}
            className="flex items-center justify-between gap-3 border-b border-[var(--f1-line)] py-[7px]"
          >
            <span className="flex items-center gap-2.5">
              <span className="w-4 shrink-0 text-right font-mono text-[11px] text-neutral-600">{i + 1}</span>
              <span className="text-sm font-medium text-white">{entry.driver}</span>
            </span>
            <span className="font-mono text-sm tabular-nums text-neutral-300">P{entry.medianPosition}</span>
          </motion.div>
        ))}
      </AnimatePresence>
      {entries.length > COMPACT_ROWS && (
        <button type="button" onClick={() => setShowAll((v) => !v)} className="mt-2 text-xs text-neutral-500 transition hover:text-white">
          {showAll ? "Show fewer ↑" : "View all →"}
        </button>
      )}
    </motion.div>
  );
}

function byDesc(key: "p1" | "podium") {
  return (a: SimulatedDriverEntry, b: SimulatedDriverEntry) => b[key] - a[key];
}

type DistBand = "win" | "podium" | "points" | "outside";
type DistEntry = {
  driver: string;
  bands: Record<DistBand, number>; // raw fractions, sum to 1 - the shape of the distribution
  p1: number; // calibrated - matches the headline Win probability column
  podium: number; // calibrated - matches the headline Podium probability column
  medianPosition: number;
};

const BANDS: { key: DistBand; label: string; color: string }[] = [
  { key: "win", label: "Win", color: "var(--f1-red)" },
  { key: "podium", label: "Podium", color: chart.sequentialBlue },
  { key: "points", label: "Points", color: chart.sequentialAmber },
  { key: "outside", label: "Outside points", color: chart.gridline },
];

// Real F1 scoring pays the top 10 - "points finish" is win+podium+P4-P10, "outside points" is
// everything past that. Built from each driver's own raw (uncalibrated) positionProbabilities, not
// a new simulation output - same array the old stacked chart read, just regrouped into the bands
// this redesign asks for instead of a P1/P2-3/P4-5/P6+ split. Raw, not calibrated, for the same
// reason the old chart used raw values: win/podium/points/outside must sum to exactly 1 for the
// bar to tile correctly, which only holds pre-calibration (see this file's own git history).
function toDistEntry(d: SimulatedDriverEntry): DistEntry {
  const p = d.positionProbabilities;
  const win = p[0] ?? 0;
  const top3 = p.slice(0, 3).reduce((sum, x) => sum + x, 0);
  const top10 = p.slice(0, 10).reduce((sum, x) => sum + x, 0);
  return {
    driver: d.driver,
    bands: {
      win,
      podium: Math.max(0, top3 - win),
      points: Math.max(0, top10 - top3),
      outside: Math.max(0, 1 - top10),
    },
    p1: d.p1,
    podium: d.podium,
    medianPosition: d.medianPosition,
  };
}

function DistributionRow({ entry, index, hovered, onHover, onLeave }: { entry: DistEntry; index: number; hovered: string | null; onHover: (d: string) => void; onLeave: () => void }) {
  const isHovered = hovered === entry.driver;
  return (
    <motion.div
      layout
      initial={{ opacity: 0, x: -6 }}
      animate={{ opacity: 1, x: 0 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2, delay: index * 0.015 }}
      className="relative flex items-center gap-2.5 rounded-md px-1 transition-colors"
      style={{ height: DIST_ROW_HEIGHT, background: isHovered ? "rgba(255,255,255,0.025)" : "transparent" }}
      onMouseEnter={() => onHover(entry.driver)}
      onMouseLeave={onLeave}
    >
      <span className="w-12 shrink-0 text-sm font-medium text-white">{entry.driver}</span>
      <div className="flex h-2.5 flex-1 overflow-hidden rounded-full" style={{ gap: 1 }}>
        {BANDS.map((band) => {
          const value = entry.bands[band.key];
          if (value <= 0) return null;
          return (
            <motion.div
              key={band.key}
              className="h-full origin-left"
              style={{ flexGrow: value, flexBasis: 0, background: band.color }}
              initial={{ scaleX: 0 }}
              whileInView={{ scaleX: 1 }}
              viewport={{ once: true, amount: 0.3 }}
              transition={{ duration: 0.4, delay: index * 0.015, ease: [0.22, 1, 0.36, 1] }}
            />
          );
        })}
      </div>
      {isHovered && (
        <div
          className="pointer-events-none absolute -top-2 left-12 z-10 -translate-y-full whitespace-nowrap rounded-lg border px-3 py-2 shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
          style={{ background: tooltipStyle.background, backdropFilter: tooltipStyle.backdropFilter, WebkitBackdropFilter: tooltipStyle.WebkitBackdropFilter, borderColor: "var(--tooltip-border)" }}
        >
          <p className="text-sm font-semibold text-white">{entry.driver}</p>
          <div className="mt-1.5 space-y-0.5 text-xs">
            <div className="flex items-center justify-between gap-4">
              <span className="text-neutral-500">Win probability</span>
              <span className="font-mono text-white">{(entry.p1 * 100).toFixed(0)}%</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-neutral-500">Podium probability</span>
              <span className="font-mono text-white">{(entry.podium * 100).toFixed(0)}%</span>
            </div>
            <div className="flex items-center justify-between gap-4">
              <span className="text-neutral-500">Expected finish</span>
              <span className="font-mono text-white">P{entry.medianPosition}</span>
            </div>
          </div>
        </div>
      )}
    </motion.div>
  );
}

export function SimulationPanel({ simulation }: { simulation: RaceSimulation }) {
  // Its own independent filter, not the shared Race Analysis one above - "Custom selection should
  // only exist inside this filtering mechanism, not as a separate UI elsewhere" (this section's own
  // request), and Simulation is its own RaceSectionCard, not a Race Analysis sub-section.
  const [driverSet, setDriverSet] = useState<DriverSet>("top10");
  const [customIds, setCustomIds] = useState<string[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);

  const byMedian = [...simulation.drivers].sort((a, b) => a.medianPosition - b.medianPosition);
  const byWin = [...simulation.drivers].sort(byDesc("p1"));
  const byPodium = [...simulation.drivers].sort(byDesc("podium"));

  const distEntries = byMedian.map(toDistEntry);
  const visibleDistEntries = filterDriverSet(distEntries, driverSet, (e) => e.driver, customIds);
  const customSelectOptions: MultiSelectOption[] = byMedian.map((d) => ({ code: d.driver, label: d.driver }));

  const driverSetFilter =
    simulation.drivers.length > 5 ? (
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
          <EntityMultiSelect options={customSelectOptions} selected={customIds} onChange={setCustomIds} placeholder="Select drivers" triggerClassName="h-8 py-1 text-xs" />
        )}
      </div>
    ) : undefined;

  return (
    <motion.div initial="hidden" animate="show" variants={staggerContainer}>
      <motion.div variants={staggerItem} className="grid gap-6 sm:grid-cols-3">
        <div className="sm:border-r sm:border-[var(--f1-line)] sm:pr-6">
          <ProbabilityBars
            label="Win probability"
            entries={byWin.map((d) => ({ driver: d.driver, pct: d.p1 * 100 }))}
            barColor="linear-gradient(90deg, rgba(225,6,0,0.55), var(--f1-red))"
          />
        </div>
        <div className="sm:border-r sm:border-[var(--f1-line)] sm:pr-6">
          <ProbabilityBars
            label="Podium probability"
            entries={byPodium.map((d) => ({ driver: d.driver, pct: d.podium * 100 }))}
            barColor="linear-gradient(90deg, rgba(59,130,214,0.55), #7fb3ec)"
          />
        </div>
        <div>
          <ExpectedFinishList entries={byMedian} />
        </div>
      </motion.div>

      <motion.div variants={staggerItem}>
        <RaceSubSection label="Finishing Position Distribution" description="Probability distribution across finishing outcomes." headerRight={driverSetFilter}>
          <div onMouseLeave={() => setHovered(null)}>
            <AnimatePresence initial={false}>
              {visibleDistEntries.map((entry, i) => (
                <DistributionRow key={entry.driver} entry={entry} index={i} hovered={hovered} onHover={setHovered} onLeave={() => setHovered(null)} />
              ))}
            </AnimatePresence>
          </div>
          <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-neutral-500">
            {BANDS.map((band) => (
              <span key={band.key} className="flex items-center gap-1.5">
                <span className="h-2 w-2 rounded-sm" style={{ background: band.color }} />
                {band.label}
              </span>
            ))}
          </div>
        </RaceSubSection>
      </motion.div>
    </motion.div>
  );
}
