"use client";

import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHomepageIntelligence } from "./HomepageIntelligenceProvider";

/** Race Intelligence Brief + One Thing To Watch, one cohesive card instead of two stacked
 * near-identical bordered boxes - both are similarly-weighted, neutral AI outputs read back to
 * back, so a divider inside one surface reads as "one briefing with two parts" rather than "two
 * separate widgets." (YourRace/BlindSpot keep their own distinct treatment on purpose - YourRace
 * is the page's editorial centerpiece, not a card among cards; BlindSpot is a deliberate
 * amber/caution outlier, not neutral informational content - see each file's own comment.) */
export function RaceBrief() {
  const { intelligence, isLoading } = useHomepageIntelligence();

  if (isLoading) {
    return <RaceBriefSkeleton />;
  }

  const { raceBrief, oneThingToWatch } = intelligence ?? {};
  if (!raceBrief && !oneThingToWatch) {
    return null;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8, filter: "blur(4px)" }}
      animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}
      transition={{ duration: 0.4, ease: "easeOut" }}
      className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5 sm:p-6"
    >
      {raceBrief && (
        <div>
          <div className="flex items-center gap-2 border-b border-white/[0.06] pb-3">
            <span className="h-1.5 w-1.5 rounded-full bg-[var(--f1-red)]" />
            <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-white">
              Race Intelligence Brief
            </h3>
          </div>

          <div className="mt-4 space-y-3">
            <p className="text-base font-semibold text-white sm:text-lg leading-snug">
              {raceBrief.headline}
            </p>

            <p className="text-sm leading-relaxed text-neutral-300">
              {raceBrief.whyItMatters}
            </p>

            <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
              <p className="text-xs text-neutral-400">
                <span className="font-semibold text-white">Key Tactical Factor: </span>
                {raceBrief.keyFactor}
              </p>
            </div>
          </div>
        </div>
      )}

      {oneThingToWatch && (
        <div className={raceBrief ? "mt-5 border-t border-white/[0.06] pt-4" : ""}>
          <div className="flex items-center gap-2">
            <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
            <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
              One Thing To Watch
            </p>
          </div>
          <p className="mt-2 text-sm font-semibold text-white sm:text-base">
            {oneThingToWatch.topic}
          </p>
          <p className="mt-1.5 text-xs leading-relaxed text-neutral-300">
            {oneThingToWatch.explanation}
          </p>
        </div>
      )}
    </motion.div>
  );
}

export function RaceBriefSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5 sm:p-6">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <Skeleton className="skeleton-shimmer h-3.5 w-36 rounded" />
        <Skeleton className="skeleton-shimmer h-3.5 w-24 rounded-full" />
      </div>
      <div className="mt-4 space-y-3">
        <Skeleton className="skeleton-shimmer h-6 w-5/6 rounded" />
        <Skeleton className="skeleton-shimmer h-4 w-full rounded" />
        <Skeleton className="skeleton-shimmer h-4 w-4/5 rounded" />
        <Skeleton className="skeleton-shimmer h-10 w-full rounded-xl mt-2" />
      </div>

      <div className="mt-5 border-t border-white/[0.06] pt-4">
        <Skeleton className="skeleton-shimmer h-3 w-28 rounded" />
        <Skeleton className="skeleton-shimmer mt-3 h-5 w-3/4 rounded" />
        <Skeleton className="skeleton-shimmer mt-2 h-3.5 w-full rounded" />
        <Skeleton className="skeleton-shimmer mt-1.5 h-3.5 w-5/6 rounded" />
      </div>
    </div>
  );
}
