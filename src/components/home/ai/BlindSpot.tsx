"use client";

import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHomepageIntelligence } from "./HomepageIntelligenceProvider";

/** Full-width, amber-accented - deliberately reads as attention/caution, not another labeled AI
 * output (no provenance badge like RaceBrief's "Nemotron Synthesis" tag). Same field as before
 * (`biggestUncertainty.{title, explanation}` - no schema/prompt change), only the static UI heading
 * changed from "Biggest Uncertainty" to "What You Might Be Missing" so it reads as a challenge to
 * notice while scanning, not a hedge. */
export function BlindSpot() {
  const { intelligence, isLoading } = useHomepageIntelligence();

  if (isLoading) {
    return <BlindSpotSkeleton />;
  }

  if (!intelligence?.biggestUncertainty) {
    return null;
  }

  const { title, explanation } = intelligence.biggestUncertainty;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl border border-amber-500/25 bg-amber-500/[0.05] p-5 sm:p-6"
    >
      <div className="flex items-center gap-2">
        <span className="h-1.5 w-1.5 rounded-full bg-amber-500" />
        <p className="text-[11px] font-semibold uppercase tracking-[0.2em] text-amber-400">
          What You Might Be Missing
        </p>
      </div>
      <p className="mt-2 text-base font-semibold text-white sm:text-lg">
        {title}
      </p>
      <p className="mt-1.5 max-w-2xl text-sm leading-relaxed text-neutral-300">
        {explanation}
      </p>
    </motion.div>
  );
}

export function BlindSpotSkeleton() {
  return (
    <div className="rounded-2xl border border-amber-500/10 bg-[var(--f1-carbon)]/40 p-5 sm:p-6">
      <Skeleton className="skeleton-shimmer h-3 w-44 rounded" />
      <Skeleton className="skeleton-shimmer mt-3 h-5 w-3/4 rounded" />
      <Skeleton className="skeleton-shimmer mt-2 h-3.5 w-full rounded" />
      <Skeleton className="skeleton-shimmer mt-1.5 h-3.5 w-4/5 rounded" />
    </div>
  );
}
