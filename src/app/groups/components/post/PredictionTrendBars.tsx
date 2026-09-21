"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import type { PredictionTrend } from "@/lib/supabase/groupPredictions";

/** Below this many entries there is no consensus to draw - two entries rendered as bars would read
 * as "the community thinks X" on the strength of two people. */
export const MIN_ENTRIES_FOR_TREND = 3;

/**
 * What the community has actually entered for one prediction round.
 *
 * One implementation, two ways in:
 *  - `trend` supplied: the caller already has the aggregate (a server component that fetched it
 *    alongside the rest of the page), so nothing is fetched here at all.
 *  - `trend` omitted: fetched on mount, per card, so a feed of predictions doesn't block on N
 *    aggregate queries before rendering anything.
 *
 * A failed aggregate renders nothing. The cost, deadline and entry action around this are all still
 * correct and usable without it, so a supporting detail stays silent rather than showing an error.
 */
export function PredictionTrendBars({
  groupId,
  predictionId,
  isPodium,
  trend: provided,
  compact = false,
}: {
  groupId: string;
  predictionId: string;
  /** A podium round aggregates on the WINNER pick only - three drivers have no single meaningful
   * distribution - so the heading says so rather than implying the whole podium matched. */
  isPodium: boolean;
  trend?: PredictionTrend | null;
  /** Drops the heading row - for a rail card that already names the round above these bars. */
  compact?: boolean;
}) {
  const [fetched, setFetched] = useState<PredictionTrend | null>(null);
  const [failed, setFailed] = useState(false);
  const needsFetch = provided === undefined;

  useEffect(() => {
    if (!needsFetch) return;
    const controller = new AbortController();
    fetch(`/api/groups/${groupId}/predictions/${predictionId}/trend`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error(`trend: ${res.status}`);
        return res.json() as Promise<PredictionTrend>;
      })
      .then(setFetched)
      .catch(() => {
        if (!controller.signal.aborted) setFailed(true);
      });
    return () => controller.abort();
  }, [groupId, predictionId, needsFetch]);

  const trend = needsFetch ? fetched : provided;

  // The whole block - including the "not enough responses" line - lives inside one AnimatePresence
  // that owns its height. This data arrives well after the card is on screen, and appearing at
  // full height in a single frame shoves everything below it down with no warning. Animating
  // height here rather than relying on the parent card's `layout` means it eases whatever the
  // card around it is doing, and it is the same easing the entry panel uses.
  return (
    <AnimatePresence initial={false}>
      {!failed && trend && (
        <motion.div
          key="trend"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: "auto", opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          className="overflow-hidden"
        >
          {trend.total < MIN_ENTRIES_FOR_TREND ? (
            <p className={`${compact ? "mt-2" : "mt-2.5"} text-xs text-neutral-600`}>{trend.total === 0 ? "No entries yet." : `Not enough responses yet (${trend.total}).`}</p>
          ) : (
            <TrendBody trend={trend} isPodium={isPodium} compact={compact} />
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}

function TrendBody({ trend, isPodium, compact }: { trend: PredictionTrend; isPodium: boolean; compact: boolean }) {
  return (
    <div className={compact ? "mt-2.5" : "mt-3 rounded-xl border border-white/[0.06] bg-black/20 p-3"}>
      {!compact && (
        <div className="flex items-center justify-between">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Community trend{isPodium ? " · winner pick" : ""}</p>
          <span className="text-[11px] tabular-nums text-neutral-600">
            {trend.total} {trend.total === 1 ? "entry" : "entries"}
          </span>
        </div>
      )}
      <ul className={compact ? "space-y-1.5" : "mt-2 space-y-1.5"}>
        {trend.options.map((o, i) => (
          <li key={o.key} className="flex items-center gap-2.5">
            <span className="min-w-0 flex-1 truncate text-xs text-neutral-300">{o.label}</span>
            <span className={`h-1.5 ${compact ? "w-20" : "w-24"} shrink-0 overflow-hidden rounded-full bg-white/[0.06]`} role="presentation">
              {/* The leader is the only bar that gets the accent - four equally red bars would say
                  nothing about which way the community is actually leaning. */}
              <motion.span
                initial={{ width: 0 }}
                animate={{ width: `${o.pct}%` }}
                transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1], delay: i * 0.05 }}
                className={`block h-full rounded-full ${i === 0 ? "bg-[var(--f1-red)]" : "bg-white/25"}`}
              />
            </span>
            <span className="w-9 shrink-0 text-right text-xs font-semibold tabular-nums text-neutral-300">{o.pct}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
