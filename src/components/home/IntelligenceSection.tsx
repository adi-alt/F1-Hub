"use client";

import { ModelWatch, ModelWatchSkeleton } from "./ModelWatch";
import { PickVsModel, PickVsModelSkeleton } from "./PickVsModel";
import { PredictionPerformance, PredictionPerformanceSkeleton } from "./PredictionPerformance";
import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import { RaceBrief, RaceBriefSkeleton } from "./ai/RaceBrief";
import { YourRace, YourRaceSkeleton } from "./ai/YourRace";
import { OneThingToWatch, OneThingToWatchSkeleton } from "./ai/OneThingToWatch";
import { BlindSpot, BlindSpotSkeleton } from "./ai/BlindSpot";
import { AIvsYou, AIvsYouSkeleton } from "./ai/AIvsYou";
import { PredictionCoach } from "./ai/PredictionCoach";
import { PredictionFingerprint } from "./ai/PredictionFingerprint";
import { SinceLastVisit } from "./ai/SinceLastVisit";
import type { PredictionPerformance as PredictionPerformanceData } from "@/lib/predictionPerformance";
import type { RaceDoc, UserPick } from "@/lib/types/race";

/**
 * The Personalized F1 Intelligence Command Center - a narrative, not a widget stack:
 * general context (RaceBrief) -> personal thesis (YourRace) -> attention (OneThingToWatch) ->
 * challenge (BlindSpot) -> decision (PickVsModel) -> argument (AIvsYou), then the secondary
 * analytics row and prediction-history cards. Combines grounded AI reasoning with deterministic
 * Random Forest predictions, Monte Carlo simulations, and user metrics.
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

      <SinceLastVisit />

      {/* General context */}
      <RaceBrief />

      {/* Personal thesis - the page's editorial centerpiece */}
      <YourRace />

      {/* Attention */}
      <OneThingToWatch />

      {/* Challenge */}
      <BlindSpot />

      {/* Decision + Argument: the chart, then the AI's commentary attached to it */}
      {hasPickVsModel && (
        <div className="space-y-4">
          <RaceSectionCard title="Your Pick vs. F1 Hub Model">
            <PickVsModel myPick={myPick} nextRace={nextRace} />
          </RaceSectionCard>
          <AIvsYou myPick={myPick} nextRace={nextRace} />
        </div>
      )}

      {/* Secondary analytical row */}
      {(hasPredictionPerf || hasModelData) && (
        <div className={`grid gap-6 ${hasPredictionPerf && hasModelData ? "sm:grid-cols-2" : "grid-cols-1"}`}>
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
      )}

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
      <YourRaceSkeleton />
      <OneThingToWatchSkeleton />
      <BlindSpotSkeleton />

      <div className="space-y-4">
        <RaceSectionCard title="Your Pick vs. F1 Hub Model">
          <PickVsModelSkeleton />
        </RaceSectionCard>
        <AIvsYouSkeleton />
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <RaceSectionCard title="Your Accuracy">
          <PredictionPerformanceSkeleton />
        </RaceSectionCard>
        <RaceSectionCard title="Machine Learning Watch">
          <ModelWatchSkeleton />
        </RaceSectionCard>
      </div>
    </section>
  );
}
