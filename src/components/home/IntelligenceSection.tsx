"use client";

import { ModelWatch, ModelWatchSkeleton } from "./ModelWatch";
import { PickVsModel, PickVsModelSkeleton } from "./PickVsModel";
import { PredictionPerformance, PredictionPerformanceSkeleton } from "./PredictionPerformance";
import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import { RaceBrief, RaceBriefSkeleton } from "./ai/RaceBrief";
import { OneThingToWatch, OneThingToWatchSkeleton } from "./ai/OneThingToWatch";
import { BiggestUncertainty, BiggestUncertaintySkeleton } from "./ai/BiggestUncertainty";
import { PredictionCoach } from "./ai/PredictionCoach";
import { PredictionFingerprint } from "./ai/PredictionFingerprint";
import type { PredictionPerformance as PredictionPerformanceData } from "@/lib/predictionPerformance";
import type { RaceDoc, UserPick } from "@/lib/types/race";

/**
 * The Personalized F1 Intelligence Command Center.
 * Combines grounded AI reasoning (RaceBrief, OneThingToWatch, BiggestUncertainty, PredictionCoach)
 * with deterministic Random Forest predictions, Monte Carlo simulations, and user metrics.
 */
export function IntelligenceSection({
  myPick,
  nextRace,
  performance,
}: {
  myPick: UserPick | null;
  nextRace: RaceDoc | null;
  performance: PredictionPerformanceData;
}) {
  const hasModelData = !!nextRace && (!!nextRace.simulation || !!nextRace.prediction);
  const hasPickVsModel = !!myPick && hasModelData;
  const hasPredictionPerf = performance.winner.total > 0;
  const hasFingerprint = performance.winner.total >= 3;

  return (
    <section className="space-y-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">
            F1 Intelligence Command Center
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            AI synthesis, Random Forest projections, and performance analysis
          </p>
        </div>
      </div>

      {/* Top: AI Race Intelligence Briefing */}
      <RaceBrief />

      {/* Tactical Row: One Thing to Watch + Biggest Uncertainty */}
      <div className="grid gap-6 sm:grid-cols-2">
        <OneThingToWatch />
        <BiggestUncertainty />
      </div>

      {/* Flagship Comparison & Model Watch Grid */}
      <div className={`grid gap-6 ${hasPickVsModel ? "lg:grid-cols-3" : "sm:grid-cols-2"}`}>
        {hasPickVsModel && (
          <div className="lg:col-span-2">
            <RaceSectionCard title="Your Pick vs. F1 Hub Model">
              <PickVsModel myPick={myPick} nextRace={nextRace} />
            </RaceSectionCard>
          </div>
        )}

        {hasPredictionPerf && (
          <RaceSectionCard title="Your Accuracy">
            <PredictionPerformance performance={performance} />
          </RaceSectionCard>
        )}

        {hasModelData && (
          <RaceSectionCard title="Machine Learning Watch">
            <ModelWatch nextRace={nextRace} />
          </RaceSectionCard>
        )}
      </div>

      {/* Prediction Coach & Fingerprint (if user has active history) */}
      {hasPredictionPerf && (
        <div className={`grid gap-6 ${hasFingerprint ? "sm:grid-cols-2" : "grid-cols-1"}`}>
          <PredictionCoach />
          {hasFingerprint && <PredictionFingerprint performance={performance} />}
        </div>
      )}
    </section>
  );
}

export function IntelligenceSkeleton() {
  return (
    <section className="space-y-6">
      <div className="space-y-1">
        <div className="skeleton-shimmer h-3.5 w-48 rounded" />
        <div className="skeleton-shimmer h-2.5 w-72 rounded opacity-50" />
      </div>

      <RaceBriefSkeleton />

      <div className="grid gap-6 sm:grid-cols-2">
        <OneThingToWatchSkeleton />
        <BiggestUncertaintySkeleton />
      </div>

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RaceSectionCard title="Your Pick vs. F1 Hub Model">
            <PickVsModelSkeleton />
          </RaceSectionCard>
        </div>
        <div className="space-y-6">
          <RaceSectionCard title="Your Accuracy">
            <PredictionPerformanceSkeleton />
          </RaceSectionCard>
          <RaceSectionCard title="Machine Learning Watch">
            <ModelWatchSkeleton />
          </RaceSectionCard>
        </div>
      </div>
    </section>
  );
}
