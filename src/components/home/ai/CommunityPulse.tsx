"use client";

import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHomepageIntelligence } from "./HomepageIntelligenceProvider";

export function CommunityPulse() {
  const { intelligence, isLoading } = useHomepageIntelligence();

  if (isLoading) {
    return <CommunityPulseSkeleton />;
  }

  if (!intelligence?.communityPulse) {
    return null;
  }

  const { summary, mostDiscussed, topics } = intelligence.communityPulse;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-4 sm:p-5"
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
          <h4 className="text-[11px] font-semibold uppercase tracking-[0.16em] text-neutral-300">
            Community Pulse
          </h4>
        </div>
        <span className="text-[10px] font-mono text-neutral-400">
          Focus: {mostDiscussed}
        </span>
      </div>

      <p className="mt-3 text-xs leading-relaxed text-neutral-300">
        {summary}
      </p>

      {topics && topics.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {topics.map((topic, i) => (
            <span
              key={i}
              className="rounded-md border border-white/[0.06] bg-white/[0.03] px-2 py-0.5 text-[10px] text-neutral-400"
            >
              #{topic}
            </span>
          ))}
        </div>
      )}
    </motion.div>
  );
}

export function CommunityPulseSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-4 sm:p-5">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-2.5">
        <Skeleton className="skeleton-shimmer h-3 w-28 rounded" />
        <Skeleton className="skeleton-shimmer h-3 w-20 rounded" />
      </div>
      <Skeleton className="skeleton-shimmer mt-3 h-4 w-full rounded" />
      <Skeleton className="skeleton-shimmer mt-1.5 h-4 w-4/5 rounded" />
      <div className="mt-3 flex gap-2">
        <Skeleton className="skeleton-shimmer h-4 w-16 rounded-md" />
        <Skeleton className="skeleton-shimmer h-4 w-20 rounded-md" />
        <Skeleton className="skeleton-shimmer h-4 w-14 rounded-md" />
      </div>
    </div>
  );
}
