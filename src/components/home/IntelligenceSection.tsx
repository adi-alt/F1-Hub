"use client";

import { ModelWatch, ModelWatchSkeleton } from "./ModelWatch";
import { PickVsModel, PickVsModelSkeleton } from "./PickVsModel";
import { PredictionPerformance, PredictionPerformanceSkeleton } from "./PredictionPerformance";
import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import { ApexIntelligenceWorkspace, ApexIntelligenceWorkspaceSkeleton } from "./ai/ApexIntelligenceWorkspace";
import { AIvsYou, AIvsYouSkeleton } from "./ai/AIvsYou";
import { PredictionIntelligence, PredictionIntelligenceSkeleton } from "./ai/PredictionIntelligence";
import { SinceLastVisit } from "./ai/SinceLastVisit";
import type { LatestPredictionSummary, PredictionPerformance as PredictionPerformanceData, PredictionStyleTrait } from "@/lib/predictionPerformance";
import type { RaceDoc, UserPick } from "@/lib/types/race";

/**
 * The Personalized F1 Intelligence Command Center - a narrative, not a widget stack:
 * one tabbed Apex Intelligence workspace (Briefing/Your Race/Watch/Risks - see
 * ApexIntelligenceWorkspace.tsx) -> decision (PickVsModel) -> argument (AIvsYou), then the
 * secondary analytics row and prediction-history cards. Combines grounded AI reasoning with
 * deterministic Random Forest predictions, Monte Carlo simulations, and user metrics.
 */
export function IntelligenceSection({
  myPick,
  nextRace,
  performance,
  latestPrediction,
  styleTraits,
  apexActiveTab,
  onApexTabChange,
}: {
  myPick: UserPick | null;
  nextRace: RaceDoc | null;
  performance: PredictionPerformanceData;
  latestPrediction: LatestPredictionSummary | null;
  styleTraits: PredictionStyleTrait[];
  apexActiveTab: string;
  onApexTabChange: (key: string) => void;
}) {
  const hasModelData = !!nextRace && (!!nextRace.simulation || !!nextRace.prediction);
  const hasPickVsModel = !!myPick && hasModelData;
  const hasPredictionPerf = performance.winner.total > 0;
  // Prediction Intelligence shows on EITHER real accuracy history OR a still-pending latest call -
  // a user's very first prediction (not yet resolved) still deserves "here's your current call",
  // not silence until their first race resolves.
  const hasPredictionIntel = hasPredictionPerf || !!latestPrediction;

  return (
    <section id="intelligence-section" className="space-y-6 scroll-mt-6">
      <div className="flex items-baseline justify-between">
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">
            F1 Intelligence Command Center
          </h2>
          <p className="mt-0.5 text-xs text-neutral-500">
            Your race context, F1 Hub Model outlook, and personalized analysis
          </p>
        </div>
      </div>

      <SinceLastVisit />

      <ApexIntelligenceWorkspace activeTab={apexActiveTab} onTabChange={onApexTabChange} />

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

      {/* Prediction Intelligence (only with real prediction activity) - one consolidated card
       * instead of two near-identical shells, covering latest call/model comparison/outcome/
       * accuracy/style traits in one story. */}
      {hasPredictionIntel && <PredictionIntelligence performance={performance} latestPrediction={latestPrediction} styleTraits={styleTraits} />}
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

      <ApexIntelligenceWorkspaceSkeleton />

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

      <PredictionIntelligenceSkeleton />
    </section>
  );
}
