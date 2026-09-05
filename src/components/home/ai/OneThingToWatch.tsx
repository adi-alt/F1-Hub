"use client";

import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHomepageIntelligence } from "./HomepageIntelligenceProvider";

export function OneThingToWatch() {
  const { intelligence, isLoading } = useHomepageIntelligence();

  if (isLoading) {
    return <OneThingToWatchSkeleton />;
  }

  if (!intelligence?.oneThingToWatch) {
    return null;
  }

  const { topic, explanation } = intelligence.oneThingToWatch;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="flex flex-col justify-between rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5"
    >
      <div>
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-blue-500" />
          <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-400">
            One Thing To Watch
          </p>
        </div>
        <p className="mt-2 text-sm font-semibold text-white sm:text-base">
          {topic}
        </p>
        <p className="mt-1.5 text-xs leading-relaxed text-neutral-300">
          {explanation}
        </p>
      </div>
    </motion.div>
  );
}

export function OneThingToWatchSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5">
      <Skeleton className="skeleton-shimmer h-3 w-28 rounded" />
      <Skeleton className="skeleton-shimmer mt-3 h-5 w-3/4 rounded" />
      <Skeleton className="skeleton-shimmer mt-2 h-3.5 w-full rounded" />
      <Skeleton className="skeleton-shimmer mt-1.5 h-3.5 w-5/6 rounded" />
    </div>
  );
}
