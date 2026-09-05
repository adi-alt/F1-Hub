"use client";

import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHomepageIntelligence } from "./HomepageIntelligenceProvider";

export function RaceBrief() {
  const { intelligence, isLoading, isFallback } = useHomepageIntelligence();

  if (isLoading) {
    return <RaceBriefSkeleton />;
  }

  if (!intelligence?.raceBrief) {
    return null;
  }

  const { headline, whyItMatters, keyFactor } = intelligence.raceBrief;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5 sm:p-6"
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--f1-red)]" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-white">
            Race Intelligence Brief
          </h3>
        </div>
        <span className="rounded-full bg-white/[0.05] px-2 py-0.5 text-[10px] font-mono text-neutral-400">
          {isFallback ? "Deterministic Analytics" : "Nemotron Synthesis"}
        </span>
      </div>

      <div className="mt-4 space-y-3">
        <p className="text-base font-semibold text-white sm:text-lg leading-snug">
          {headline}
        </p>

        <p className="text-sm leading-relaxed text-neutral-300">
          {whyItMatters}
        </p>

        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] px-3.5 py-2.5">
          <p className="text-xs text-neutral-400">
            <span className="font-semibold text-white">Key Tactical Factor: </span>
            {keyFactor}
          </p>
        </div>
      </div>
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
    </div>
  );
}
