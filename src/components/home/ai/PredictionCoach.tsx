"use client";

import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHomepageIntelligence } from "./HomepageIntelligenceProvider";

export function PredictionCoach() {
  const { intelligence, isLoading } = useHomepageIntelligence();

  if (isLoading) {
    return <PredictionCoachSkeleton />;
  }

  if (!intelligence?.predictionCoach) {
    return null;
  }

  const { analysis, tendency } = intelligence.predictionCoach;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5 sm:p-6"
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-purple-500" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-white">
            Prediction Coach
          </h3>
        </div>
        <span className="text-[10px] font-mono text-neutral-400">Personalized Insights</span>
      </div>

      <div className="mt-4 space-y-2.5">
        <p className="text-sm font-medium text-white leading-relaxed">
          {analysis}
        </p>
        <div className="rounded-xl border border-white/[0.06] bg-white/[0.02] p-3 text-xs text-neutral-300">
          <span className="font-semibold text-purple-400">Tendency Profile: </span>
          {tendency}
        </div>
      </div>
    </motion.div>
  );
}

export function PredictionCoachSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5 sm:p-6">
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <Skeleton className="skeleton-shimmer h-3.5 w-32 rounded" />
        <Skeleton className="skeleton-shimmer h-3 w-20 rounded" />
      </div>
      <div className="mt-4 space-y-2.5">
        <Skeleton className="skeleton-shimmer h-4 w-full rounded" />
        <Skeleton className="skeleton-shimmer h-12 w-full rounded-xl" />
      </div>
    </div>
  );
}
