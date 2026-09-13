"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/Skeleton";
import { chart, tooltipStyle } from "@/components/charts/chartTheme";
import type { PredictionPerformance as PredictionPerformanceData, RecentPredictionResult } from "@/lib/predictionPerformance";

const RESULT_COLOR: Record<RecentPredictionResult, string> = {
  winner: chart.sequentialGreen,
  partial: chart.sequentialAmber,
  miss: chart.gridline,
};
const RESULT_LABEL: Record<RecentPredictionResult, string> = {
  winner: "Winner correct",
  partial: "Podium slot correct",
  miss: "Miss",
};

/** Three precisely-defined stats, never a blended "accuracy %" — winner-pick accuracy and
 * podium-slot accuracy don't combine into one meaningful number. A compact recent-result strip
 * (not a donut) gives the "trend" the request asks for. */
export function PredictionPerformance({ performance }: { performance: PredictionPerformanceData }) {
  const [hovered, setHovered] = useState<number | null>(null);

  if (performance.winner.total === 0) {
    return <p className="text-sm text-neutral-500">Make a few race predictions to see your prediction trend.</p>;
  }

  const oldestFirst = [...performance.recent].reverse();

  return (
    <div>
      <div className="flex flex-wrap gap-x-6 gap-y-2">
        <div>
          <p className="font-mono text-lg font-semibold text-white">
            {performance.winner.correct}/{performance.winner.total}
          </p>
          <p className="text-[11px] text-neutral-500">Winner picks</p>
        </div>
        <div>
          <p className="font-mono text-lg font-semibold text-white">
            {performance.podiumSlots.correct}/{performance.podiumSlots.total}
          </p>
          <p className="text-[11px] text-neutral-500">Podium slots</p>
        </div>
        {performance.avgPositionError != null && (
          <div>
            <p className="font-mono text-lg font-semibold text-white">{performance.avgPositionError.toFixed(1)}</p>
            <p className="text-[11px] text-neutral-500">Avg error (pos)</p>
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center gap-1.5" onMouseLeave={() => setHovered(null)}>
        {oldestFirst.map((r, i) => (
          <div key={r.raceId} className="relative">
            <motion.span
              initial={{ opacity: 0, scale: 0.6 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.2, delay: i * 0.03 }}
              onMouseEnter={() => setHovered(i)}
              className="block h-2.5 w-2.5 rounded-full"
              style={{ background: RESULT_COLOR[r.result] }}
            />
            {hovered === i && (
              <div
                className="pointer-events-none absolute -top-2 left-1/2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg border px-2.5 py-1.5 text-xs shadow-[0_12px_32px_rgba(0,0,0,0.35)]"
                style={{ background: tooltipStyle.background, backdropFilter: tooltipStyle.backdropFilter, WebkitBackdropFilter: tooltipStyle.WebkitBackdropFilter, borderColor: "var(--tooltip-border)" }}
              >
                <p className="font-semibold text-white">{r.raceName}</p>
                <p className="text-neutral-400">{RESULT_LABEL[r.result]}</p>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

export function PredictionPerformanceSkeleton() {
  return (
    <div>
      <div className="flex gap-6">
        <Skeleton className="skeleton-shimmer h-8 w-16 rounded" />
        <Skeleton className="skeleton-shimmer h-8 w-16 rounded" />
      </div>
      <div className="mt-4 flex gap-1.5">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="skeleton-shimmer h-2.5 w-2.5 rounded-full" />
        ))}
      </div>
    </div>
  );
}
