"use client";

import { motion } from "framer-motion";
import { Skeleton } from "@/components/ui/Skeleton";
import { useHomepageIntelligence } from "./HomepageIntelligenceProvider";
import type { PredictionPerformance } from "@/lib/predictionPerformance";

export function PredictionFingerprint({
  performance,
}: {
  performance: PredictionPerformance | null;
}) {
  const { intelligence, isLoading } = useHomepageIntelligence();

  if (!performance || performance.winner.total < 3) {
    return null;
  }

  const winnerAcc = Math.round(
    performance.winner.total > 0
      ? (performance.winner.correct / performance.winner.total) * 100
      : 0,
  );
  const podiumAcc = Math.round(
    performance.podiumSlots.total > 0
      ? (performance.podiumSlots.correct / performance.podiumSlots.total) * 100
      : 0,
  );
  const avgError =
    performance.avgPositionError != null ? performance.avgPositionError.toFixed(1) : "0.0";
  const interpretation =
    intelligence?.predictionCoach?.analysis ||
    `Across ${performance.winner.total} predictions, you have a ${winnerAcc}% winner hit rate with an average position error of ${avgError}.`;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5 sm:p-6"
    >
      <div className="flex items-center justify-between border-b border-white/[0.06] pb-3">
        <div className="flex items-center gap-2">
          <span className="h-1.5 w-1.5 rounded-full bg-cyan-500" />
          <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-white">
            Prediction Fingerprint
          </h3>
        </div>
        <span className="text-[10px] font-mono text-neutral-400">
          {performance.winner.total} Races Analyzed
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-4 border-b border-white/[0.06] pb-4 text-center">
        <div>
          <p className="text-[10px] uppercase tracking-wide text-neutral-500">Winner Acc</p>
          <p className="mt-1 font-mono text-xl font-bold text-white">{winnerAcc}%</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-neutral-500">Podium Acc</p>
          <p className="mt-1 font-mono text-xl font-bold text-white">{podiumAcc}%</p>
        </div>
        <div>
          <p className="text-[10px] uppercase tracking-wide text-neutral-500">Avg Error</p>
          <p className="mt-1 font-mono text-xl font-bold text-white">±{avgError}</p>
        </div>
      </div>

      <div className="mt-4">
        <p className="text-xs leading-relaxed text-neutral-300">
          <span className="font-semibold text-cyan-400">Analyst Interpretation: </span>
          {isLoading ? "Synthesizing prediction tendencies..." : interpretation}
        </p>
      </div>
    </motion.div>
  );
}

export function PredictionFingerprintSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5 sm:p-6">
      <Skeleton className="skeleton-shimmer h-3.5 w-40 rounded" />
      <div className="mt-4 grid grid-cols-3 gap-4 border-b border-white/[0.06] pb-4">
        <Skeleton className="skeleton-shimmer h-12 rounded-xl" />
        <Skeleton className="skeleton-shimmer h-12 rounded-xl" />
        <Skeleton className="skeleton-shimmer h-12 rounded-xl" />
      </div>
      <Skeleton className="skeleton-shimmer mt-4 h-4 w-5/6 rounded" />
    </div>
  );
}
