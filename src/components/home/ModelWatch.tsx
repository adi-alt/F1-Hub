"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/Skeleton";
import { raceHref } from "@/lib/routes";
import type { RaceDoc } from "@/lib/types/race";

const TOP_N = 3;

/** Compact Random-Forest/simulation surface — same data Race page's SimulationPanel reads
 * (nextRace.simulation, falling back to nextRace.prediction before qualifying), just a 3-row
 * ranked list instead of the full driver-set-filterable panel. Not counted as a 4th "chart" under
 * the diversity rule — a ranked list, not a chart. */
export function ModelWatch({ nextRace }: { nextRace: RaceDoc | null }) {
  if (!nextRace) return null;

  const bySimulation = nextRace.simulation
    ? [...nextRace.simulation.drivers].sort((a, b) => b.p1 - a.p1).slice(0, TOP_N).map((d) => ({ driver: d.driver, pct: d.p1 * 100 }))
    : null;
  const byPrediction = !bySimulation && nextRace.prediction
    ? [...nextRace.prediction.finishOrder].sort((a, b) => a.predictedPosition - b.predictedPosition).slice(0, TOP_N).map((d) => ({ driver: d.driver, predictedPosition: d.predictedPosition }))
    : null;

  if (!bySimulation && !byPrediction) return null;
  const max = bySimulation ? Math.max(...bySimulation.map((d) => d.pct), 0.01) : 1;

  return (
    <div>
      <div className="space-y-2">
        {bySimulation
          ? bySimulation.map((d, i) => (
              <motion.div key={d.driver} initial={{ opacity: 0, x: -6 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.2, delay: i * 0.04 }} className="flex items-center gap-2.5">
                <span className="w-14 shrink-0 text-sm font-medium text-white">{d.driver}</span>
                <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                  <motion.div className="h-full origin-left rounded-full" initial={{ scaleX: 0 }} whileInView={{ scaleX: d.pct / max }} viewport={{ once: true }} transition={{ duration: 0.4, ease: "easeOut" }} style={{ background: "var(--f1-red)" }} />
                </div>
                <span className="w-9 shrink-0 text-right font-mono text-sm text-white">{d.pct.toFixed(0)}%</span>
              </motion.div>
            ))
          : byPrediction!.map((d, i) => (
              <motion.div key={d.driver} initial={{ opacity: 0, x: -6 }} whileInView={{ opacity: 1, x: 0 }} viewport={{ once: true }} transition={{ duration: 0.2, delay: i * 0.04 }} className="flex items-center justify-between">
                <span className="text-sm font-medium text-white">{d.driver}</span>
                <span className="font-mono text-sm text-neutral-400">P{d.predictedPosition}</span>
              </motion.div>
            ))}
      </div>
      <Link
        href={raceHref(nextRace.year, nextRace.round, nextRace.name, "simulation")}
        className="mt-3 inline-block text-xs text-neutral-500 transition hover:text-white"
      >
        View model analysis →
      </Link>
    </div>
  );
}

export function ModelWatchSkeleton() {
  return (
    <div className="space-y-2">
      {Array.from({ length: TOP_N }).map((_, i) => (
        <Skeleton key={i} className="skeleton-shimmer h-4 w-full rounded" />
      ))}
    </div>
  );
}
