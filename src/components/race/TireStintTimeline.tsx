"use client";

import { useState } from "react";
import { QuietTabs } from "@/app/season/_components/QuietTabs";
import type { RaceResultEntry, TireStint } from "@/lib/types/race";

type DriverSet = "top5" | "top10" | "all";

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
export function TireStintTimeline({ stints, results }: { stints: TireStint[]; results: RaceResultEntry[] }) {
  const [driverSet, setDriverSet] = useState<DriverSet>("top5");

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
      <QuietTabs
        options={[
          { value: "top5" as const, label: "Top 5" },
          { value: "top10" as const, label: "Top 10" },
          { value: "all" as const, label: "All drivers" },
        ]}
        value={driverSet}
        onChange={setDriverSet}
        className="mb-3 text-xs"
      />
      <div className="space-y-3">
        {visibleDrivers.map((driver) => {
          const sorted = [...byDriver.get(driver)!].sort((a, b) => a.stintNumber - b.stintNumber);
          const totalLaps = sorted.reduce((sum, s) => sum + s.lapCount, 0);
          let lapCursor = 0;
          return (
            <div key={driver} className="flex items-center gap-3">
              <span className="w-14 shrink-0 text-sm font-medium text-white">{driver}</span>
              <div className="flex h-5 flex-1 overflow-hidden rounded-md" style={{ gap: 1 }}>
                {sorted.map((s) => {
                  const startLap = lapCursor + 1;
                  lapCursor += s.lapCount;
                  return (
                    <div
                      key={s.stintNumber}
                      className="flex items-center justify-center text-[9px] font-semibold uppercase tracking-wide text-black/70"
                      style={{ flexGrow: s.lapCount, flexBasis: 0, background: compoundColor(s.compound) }}
                      title={`${s.compound} · laps ${startLap}-${lapCursor}`}
                    >
                      {s.lapCount >= 4 ? s.compound.slice(0, 1) : ""}
                    </div>
                  );
                })}
              </div>
              <span className="w-16 shrink-0 text-right text-xs text-neutral-500">{totalLaps} laps</span>
            </div>
          );
        })}
        <div className="mt-1 flex flex-wrap gap-3 text-[10px] text-neutral-500">
          {Object.entries(COMPOUND_COLOR).map(([name, color]) => (
            <span key={name} className="flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-sm" style={{ background: color }} />
              {name.charAt(0) + name.slice(1).toLowerCase()}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
