"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/Skeleton";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import type { RaceDoc } from "@/lib/types/race";

const RESULTS_SHOWN = 5;

type FormResult = { raceId: string; raceName: string; round: number; finishPosition: number; grid: number | null; points: number };

function nodeColor(position: number): string {
  if (position === 1) return "var(--f1-red)";
  if (position <= 3) return chart.sequentialAmber;
  if (position <= 10) return chart.sequentialBlue;
  return chart.gridline;
}

function buildForm(driverCode: string, races: RaceDoc[]): FormResult[] {
  return races
    .filter((r) => r.status === "completed")
    .sort((a, b) => a.round - b.round)
    .flatMap((r) => {
      const result = r.results?.find((res) => res.driver === driverCode);
      if (!result) return [];
      const grid = r.inputs?.find((inp) => inp.driver === driverCode)?.grid ?? null;
      return [{ raceId: r.id, raceName: r.name, round: r.round, finishPosition: result.finishPosition, grid, points: result.points }];
    })
    .slice(-RESULTS_SHOWN);
}

/** A modern result-node timeline, not a line chart — each race is a compact node sized/colored by
 * finishing-position tier, connected by a plain line, hover reveals grid/finish/points via the
 * shared frosted tooltip. Lives inside "Your F1" (describes the driver, not the user's own
 * predictive performance — that's PredictionPerformance, in Intelligence). */
export function DriverFormStrip({ favoriteDriverCode, races }: { favoriteDriverCode: string; races: RaceDoc[] }) {
  const [hovered, setHovered] = useState<number | null>(null);
  const form = buildForm(favoriteDriverCode, races);

  if (form.length === 0) {
    return <p className="text-sm text-neutral-500">No finishes yet this season.</p>;
  }

  return (
    <div>
      <p className="mb-2.5 text-xs font-semibold uppercase tracking-[0.16em] text-neutral-500">Recent form</p>
      <div className="flex items-center" onMouseLeave={() => setHovered(null)}>
        {form.map((r, i) => (
          <div key={r.raceId} className="relative flex items-center">
            {i > 0 && <div className="h-px w-6 shrink-0 bg-[var(--f1-line)] sm:w-10" />}
            <motion.button
              type="button"
              initial={{ opacity: 0, scale: 0.6 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.25, delay: i * 0.05, ease: "easeOut" }}
              onMouseEnter={() => setHovered(i)}
              onFocus={() => setHovered(i)}
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold text-white"
              style={{ background: nodeColor(r.finishPosition) }}
            >
              P{r.finishPosition}
            </motion.button>
            {hovered === i && (
              <div
                className="pointer-events-none absolute -top-3 left-1/2 z-10 w-40 -translate-x-1/2 -translate-y-full rounded-lg border px-3 py-2 text-xs shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
                style={{ background: tooltipStyle.background, backdropFilter: tooltipStyle.backdropFilter, WebkitBackdropFilter: tooltipStyle.WebkitBackdropFilter, borderColor: "var(--tooltip-border)" }}
              >
                <p className="font-semibold text-white">{r.raceName}</p>
                <div className="mt-1 space-y-0.5 text-neutral-400">
                  {r.grid && <p>Grid P{r.grid}</p>}
                  <p>Finished P{r.finishPosition}</p>
                  <p>{r.points} pts</p>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function DriverFormStripSkeleton() {
  return (
    <div>
      <Skeleton className="skeleton-shimmer mb-2.5 h-3 w-24 rounded" />
      <div className="flex items-center gap-2">
        {Array.from({ length: RESULTS_SHOWN }).map((_, i) => (
          <Skeleton key={i} className="skeleton-shimmer h-9 w-9 rounded-full" />
        ))}
      </div>
    </div>
  );
}
