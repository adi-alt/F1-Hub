"use client";

import { motion } from "framer-motion";
import { SESSION_ROW_HEIGHT } from "@/components/charts/chartTheme";
import type { DriverSet } from "@/lib/driverSet";
import type { RaceResultEntry, TireStint } from "@/lib/types/race";

// FastF1's own compound names (SOFT/MEDIUM/HARD/INTERMEDIATE/WET, occasionally lowercase) - F1's
// real, universally-recognized tyre colors, not an arbitrary palette.
const COMPOUND_COLOR: Record<string, string> = {
  SOFT: "#e8002d",
  MEDIUM: "#ffcc00",
  HARD: "#e6e6e6",
  INTERMEDIATE: "#43b02a",
  WET: "#2293d1",
};

function compoundColor(compound: string): string {
  return COMPOUND_COLOR[compound.toUpperCase()] ?? "#898781";
}

/** A real stint timeline (SOFT────MEDIUM────HARD, proportional to actual laps run) instead of the
 * old plain compound+lap-count chip list - TireStint's cumulative lapCount per stintNumber is
 * exactly what's needed to derive real start/end laps, no data this doesn't already have. Archive's
 * Strategy tab keeps PitStopsTimeline unchanged - archive_pit_stops has no compound field at all,
 * so this same visualization genuinely can't be built there. */
export function TireStintTimeline({
  stints,
  results,
  driverSet,
}: {
  stints: TireStint[];
  results: RaceResultEntry[];
  // The shared Top 5/10/All filter (lifted to SeasonRaceDashboard, driving Qualifying too) - own
  // ordering (finishing position, unchanged), sliced to the shared count.
  driverSet: DriverSet;
}) {
  const byDriver = new Map<string, TireStint[]>();
  for (const s of stints) {
    const list = byDriver.get(s.driver) ?? [];
    list.push(s);
    byDriver.set(s.driver, list);
  }

  // Real finishing order, not whatever order stints happened to arrive in.
  const rankedDrivers = [...results].sort((a, b) => a.finishPosition - b.finishPosition).map((r) => r.driver).filter((d) => byDriver.has(d));
  const visibleDrivers = driverSet === "all" ? rankedDrivers : rankedDrivers.slice(0, driverSet === "top5" ? 5 : 10);

  return (
    <div>
      {/* `layout` - row count changes with the Top 5/Top 10/All drivers switch, so the list's own
          height animates instead of snapping instantly. Every row is exactly SESSION_ROW_HEIGHT,
          no gap between them (not space-y-*) - the same body-height formula Qualifying's Recharts
          chart uses (rowCount * SESSION_ROW_HEIGHT), so N drivers occupies the identical pixel
          height on both sides. The legend is a sibling below this div, not part of it - it's
          chrome, like Qualifying's own axis label, not part of the row-count-driven body. */}
      <motion.div layout>
        {visibleDrivers.map((driver, driverIndex) => {
          const sorted = [...byDriver.get(driver)!].sort((a, b) => a.stintNumber - b.stintNumber);
          const totalLaps = sorted.reduce((sum, s) => sum + s.lapCount, 0);
          let lapCursor = 0;
          return (
            <div key={driver} className="flex items-center gap-3" style={{ height: SESSION_ROW_HEIGHT }}>
              <span className="w-14 shrink-0 text-sm font-medium text-white">{driver}</span>
              <div className="flex h-5 flex-1 overflow-hidden rounded-md" style={{ gap: 1 }}>
                {sorted.map((s, stintIndex) => {
                  const startLap = lapCursor + 1;
                  lapCursor += s.lapCount;
                  return (
                    // scaleX, not width - these are flex children sized by flexGrow (the actual
                    // lap-proportional width), so a transform is what reveals the segment without
                    // fighting the layout that already sized it. transformOrigin left so it grows
                    // start-to-end, matching "reveal left to right." Staggered per stint, and
                    // again per driver row, but modest (small deltas) - real polish, not a light
                    // show for a strategy chart someone's trying to read.
                    <motion.div
                      key={s.stintNumber}
                      className="flex items-center justify-center text-[9px] font-semibold uppercase tracking-wide text-black/70"
                      style={{ flexGrow: s.lapCount, flexBasis: 0, background: compoundColor(s.compound), transformOrigin: "left" }}
                      initial={{ scaleX: 0 }}
                      whileInView={{ scaleX: 1 }}
                      viewport={{ once: true, amount: 0.3 }}
                      transition={{ duration: 0.5, delay: driverIndex * 0.04 + stintIndex * 0.08, ease: [0.22, 1, 0.36, 1] }}
                      title={`${s.compound} · laps ${startLap}-${lapCursor}`}
                    >
                      {s.lapCount >= 4 ? s.compound.slice(0, 1) : ""}
                    </motion.div>
                  );
                })}
              </div>
              <span className="w-16 shrink-0 text-right text-xs text-neutral-500">{totalLaps} laps</span>
            </div>
          );
        })}
      </motion.div>
      <div className="mt-3 flex flex-wrap gap-3 text-[10px] text-neutral-500">
        {Object.entries(COMPOUND_COLOR).map(([name, color]) => (
          <span key={name} className="flex items-center gap-1.5">
            <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
            {name.charAt(0) + name.slice(1).toLowerCase()}
          </span>
        ))}
      </div>
    </div>
  );
}
