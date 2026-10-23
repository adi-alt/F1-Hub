"use client";

import { AnimatePresence, motion } from "motion/react";
import { Skeleton } from "@/components/ui/Skeleton";
import type { PredictionTrend } from "@/lib/groupPredictionTypes";

import { MIN_ENTRIES_FOR_TREND } from "@/components/predictions/PredictionCard";

/**
 * What the community has actually entered for one prediction round, as bars. The aggregate comes
 * from the caller (the server, or the batched trend request) - nothing is fetched per round here.
 * `undefined` is still loading and shows a skeleton; null (unavailable) and a trend below
 * MIN_ENTRIES_FOR_TREND render nothing, since the round's entry count is already shown beside it.
 */
export function PredictionTrendBars({
  isPodium,
  trend,
  compact = false,
}: {
  /** A podium round aggregates on the WINNER pick only, so the heading says so. */
  isPodium: boolean;
  trend: PredictionTrend | null | undefined;
  /** Drops the heading row - for a rail card that already names the round above these bars. */
  compact?: boolean;
}) {
  const isLoading = trend === undefined;
  const hasTrend = !!trend && trend.total >= MIN_ENTRIES_FOR_TREND;

  // The whole block - skeleton and real bars - lives inside one AnimatePresence that owns its
  // height. This data arrives well after the card is on screen, and appearing from nothing in a
  // single frame shoves everything below it down with no warning.
  //
  // The skeleton reserves roughly the real block's footprint BEFORE the fetch resolves, rather
  // than rendering nothing while it's in flight - real data then settles into space that was
  // already there instead of growing the card out from under whatever's below it. It can't know
  // the real row count, or whether the round will ultimately land below the trend threshold and
  // render nothing at all; the height animation on the transition out is what absorbs that.
  return (
    <AnimatePresence initial={false} mode="popLayout">
      {(isLoading || hasTrend) && (
        <motion.div
          key={isLoading ? "trend-skeleton" : "trend"}
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          {isLoading ? <TrendSkeleton compact={compact} /> : trend ? <TrendBody trend={trend} isPodium={isPodium} compact={compact} /> : null}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/** Mirrors TrendBody's real geometry (heading row, three option rows, each with a label, a bar and
 * a percentage) so the card doesn't move when real data swaps in over it - the same convention
 * PostCardSkeleton follows for the card around this one. */
function TrendSkeleton({ compact }: { compact: boolean }) {
  return (
    <div className={compact ? "mt-2.5" : "mt-3 rounded-xl border border-white/10 bg-black/20 p-3"}>
      {!compact && (
        <div className="flex items-center justify-between">
          <Skeleton shape="block" className="h-2.5 w-32" />
          <Skeleton shape="block" className="h-2.5 w-14" />
        </div>
      )}
      <ul className={compact ? "space-y-1.5" : "mt-2 space-y-1.5"}>
        {[0, 1, 2].map((i) => (
          <li key={i} className="flex items-center gap-2.5">
            <Skeleton shape="block" className="h-3 min-w-0 flex-1" />
            <Skeleton shape="circle" className={`h-1.5 ${compact ? "w-20" : "w-24"} shrink-0`} />
            <Skeleton shape="block" className="h-3 w-9 shrink-0" />
          </li>
        ))}
      </ul>
    </div>
  );
}

function TrendBody({ trend, isPodium, compact }: { trend: PredictionTrend; isPodium: boolean; compact: boolean }) {
  return (
    <div className={compact ? "mt-2.5" : "mt-3 rounded-xl border border-white/10 bg-black/20 p-3"}>
      {!compact && (
        <div className="flex items-center justify-between">
          <p className="text-caption font-semibold text-tertiary">Community trend{isPodium ? " · winner pick" : ""}</p>
          <span className="text-caption tabular text-tertiary">
            {trend.total} {trend.total === 1 ? "entry" : "entries"}
          </span>
        </div>
      )}
      <ul className={compact ? "space-y-1.5" : "mt-2 space-y-1.5"}>
        {trend.options.map((o, i) => (
          <li key={o.key} className="flex items-center gap-2.5">
            <span className="min-w-0 flex-1 truncate text-xs text-secondary">{o.label}</span>
            <span className={`h-1.5 ${compact ? "w-20" : "w-24"} shrink-0 overflow-hidden rounded-full bg-white/[0.06]`} role="presentation">
              {/* The leader is the only bar that gets the accent - four equally red bars would say
                  nothing about which way the community is actually leaning. */}
              <motion.span
                initial={{ width: 0 }}
                animate={{ width: `${o.pct}%` }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: i * 0.05 }}
                className={`block h-full rounded-full ${i === 0 ? "bg-primary/80" : "bg-white/25"}`}
              />
            </span>
            <span className="w-9 shrink-0 text-right text-xs font-semibold tabular text-secondary">{o.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
