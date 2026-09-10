"use client";

import { motion } from "framer-motion";
import { useHomepageIntelligence } from "./HomepageIntelligenceProvider";
import { Skeleton } from "@/components/ui/Skeleton";
import { MIN_PREDICTIONS_FOR_TREND, type LatestPredictionSummary, type PredictionPerformance, type PredictionStyleTrait } from "@/lib/predictionPerformance";

const RESULT_LABEL: Record<string, string> = { winner: "Nailed it", partial: "Partial hit", miss: "Missed" };

/** Consolidates what used to be two near-identical hand-rolled card shells (PredictionCoach +
 * PredictionFingerprint, differing only by an accent dot color) into one real story: your latest
 * call (decoupled from whatever `nextRace` currently is - see getLatestPredictionSummary), how it
 * compares to the model, the outcome once resolved, real accuracy numbers, and threshold-gated
 * style traits - never a fabricated "personality" claim. Gated entirely on real prediction activity
 * by the caller (`hasPredictionPerf` in IntelligenceSection.tsx) - this component itself also
 * bails out on zero predictions as a defensive second gate, never rendering an empty placeholder. */
export function PredictionIntelligence({
  performance,
  latestPrediction,
  styleTraits,
}: {
  performance: PredictionPerformance;
  latestPrediction: LatestPredictionSummary | null;
  styleTraits: PredictionStyleTrait[];
}) {
  const { intelligence, isLoading } = useHomepageIntelligence();
  // Defensive second gate, mirroring IntelligenceSection's own hasPredictionIntel: real accuracy
  // history OR at least one still-pending latest call - never render on truly zero activity.
  if (performance.winner.total === 0 && !latestPrediction) return null;

  const winnerAcc = performance.winner.total > 0 ? Math.round((performance.winner.correct / performance.winner.total) * 100) : 0;
  const podiumAcc = performance.podiumSlots.total > 0 ? Math.round((performance.podiumSlots.correct / performance.podiumSlots.total) * 100) : 0;
  const avgError = performance.avgPositionError != null ? performance.avgPositionError.toFixed(1) : null;
  const showAccuracy = performance.winner.total >= 3;
  const showTendency = performance.winner.total >= MIN_PREDICTIONS_FOR_TREND && intelligence?.predictionCoach?.tendency;
  // The common case for a new/light user: only the latest-call block has anything to show. A real
  // compact layout for this case, not just less padding on the same stacked-paragraph block - see
  // the plan's own review note ("only show information that actually exists": no invented model-
  // confidence percentage or sentiment, just the real agree/disagree fact already computed).
  const isSparse = !showAccuracy && styleTraits.length === 0 && !showTendency;
  const modelAgrees = latestPrediction?.modelWinner != null && latestPrediction.modelWinner === latestPrediction.predictedWinner;
  const modelDisagrees = latestPrediction?.modelWinner != null && latestPrediction.modelWinner !== latestPrediction.predictedWinner;

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, ease: "easeOut" }}
      className={`rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 ${isSparse ? "p-4 sm:p-5" : "p-5 sm:p-6"}`}
    >
      <div className={isSparse ? "" : "border-b border-white/[0.06] pb-3"}>
        <h3 className="text-xs font-semibold uppercase tracking-[0.2em] text-white">Your Prediction Intelligence</h3>
        {!isSparse && <p className="mt-0.5 text-[11px] text-neutral-500">How your race calls compare with the model and the grid.</p>}
      </div>

      {latestPrediction && isSparse && (
        // Compact insight row: round is a small metadata label, the prediction itself is the large
        // focal text, model agreement is a real-data chip (not an invented confidence score).
        <div className="mt-3 border-l-2 border-white/10 pl-4">
          <p className="text-[10px] uppercase tracking-wide text-neutral-500">Round {latestPrediction.round}</p>
          <div className="mt-1 flex flex-wrap items-center gap-2">
            <p className="text-base font-semibold text-white">{latestPrediction.predictedWinner} to win</p>
            {(modelAgrees || modelDisagrees) && (
              <span className={`rounded-md border px-2 py-0.5 text-[10px] font-medium ${modelAgrees ? "border-emerald-500/25 text-emerald-300" : "border-white/[0.08] text-neutral-400"}`}>
                {modelAgrees ? "Agrees with model" : "Against the model"}
              </span>
            )}
          </div>
          {latestPrediction.status === "resolved" && latestPrediction.actualWinner && (
            <p className="mt-1 text-xs text-neutral-400">
              Actual: {latestPrediction.actualWinner}
              {latestPrediction.result && (
                <span className={latestPrediction.result === "winner" ? "ml-1.5 text-[var(--f1-red)]" : "ml-1.5"}>({RESULT_LABEL[latestPrediction.result]})</span>
              )}
            </p>
          )}
        </div>
      )}

      {latestPrediction && !isSparse && (
        <div className="mt-4 space-y-1.5 border-l-2 border-white/10 pl-4 text-sm">
          <p className="text-[10px] uppercase tracking-wide text-neutral-500">
            {latestPrediction.status === "resolved" ? `Round ${latestPrediction.round}: resolved` : `Round ${latestPrediction.round}: your latest call`}
          </p>
          <p className="text-neutral-300">
            <span className="font-medium text-neutral-200">You: </span>
            {latestPrediction.predictedWinner} to win
            {latestPrediction.modelWinner && latestPrediction.modelWinner !== latestPrediction.predictedWinner && (
              <>
                {" "}
                · <span className="font-medium text-neutral-200">Model: </span>
                {latestPrediction.modelWinner}
              </>
            )}
          </p>
          {latestPrediction.status === "resolved" && latestPrediction.actualWinner && (
            <p className="text-neutral-400">
              <span className="font-medium text-neutral-200">Actual: </span>
              {latestPrediction.actualWinner}
              {latestPrediction.result && (
                <span className={latestPrediction.result === "winner" ? "ml-1.5 text-[var(--f1-red)]" : "ml-1.5"}>
                  ({RESULT_LABEL[latestPrediction.result]})
                </span>
              )}
            </p>
          )}
        </div>
      )}

      {showAccuracy && (
        <div className="mt-4 grid grid-cols-3 gap-4 border-t border-white/[0.06] pt-4 text-center">
          <div>
            <p className="text-[10px] uppercase tracking-wide text-neutral-500">Winner Acc</p>
            <p className="mt-1 font-mono text-lg font-semibold text-white">{winnerAcc}%</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-neutral-500">Podium Acc</p>
            <p className="mt-1 font-mono text-lg font-semibold text-white">{podiumAcc}%</p>
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-wide text-neutral-500">Avg Error</p>
            <p className="mt-1 font-mono text-lg font-semibold text-white">{avgError != null ? `±${avgError}` : "—"}</p>
          </div>
        </div>
      )}

      {styleTraits.length > 0 && (
        <div className="mt-4 flex flex-wrap gap-2 border-t border-white/[0.06] pt-4">
          {styleTraits.map((t) => (
            <span key={t.label} className="rounded-md border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-[11px] text-neutral-300" title={t.detail}>
              {t.label}
            </span>
          ))}
        </div>
      )}

      {showTendency && (
        <p className="mt-3 text-xs leading-relaxed text-neutral-400">
          <span className="font-semibold text-purple-400">Tendency: </span>
          {intelligence!.predictionCoach!.tendency}
        </p>
      )}

      {intelligence?.predictionCoach?.analysis && (
        <p className="mt-3 text-xs leading-relaxed text-neutral-300">
          <span className="font-semibold text-purple-400">Apex&apos;s read: </span>
          {isLoading ? "Synthesizing..." : intelligence.predictionCoach.analysis}
        </p>
      )}
    </motion.div>
  );
}

export function PredictionIntelligenceSkeleton() {
  return (
    <div className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/40 p-5 sm:p-6">
      <Skeleton className="skeleton-shimmer h-3.5 w-48 rounded" />
      <div className="mt-4 space-y-2 border-l-2 border-white/10 pl-4">
        <Skeleton className="skeleton-shimmer h-3 w-24 rounded" />
        <Skeleton className="skeleton-shimmer h-4 w-full rounded" />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-4 border-t border-white/[0.06] pt-4">
        <Skeleton className="skeleton-shimmer h-10 rounded-xl" />
        <Skeleton className="skeleton-shimmer h-10 rounded-xl" />
        <Skeleton className="skeleton-shimmer h-10 rounded-xl" />
      </div>
    </div>
  );
}
