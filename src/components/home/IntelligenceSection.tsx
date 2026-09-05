import { ModelWatch, ModelWatchSkeleton } from "./ModelWatch";
import { PickVsModel, PickVsModelSkeleton } from "./PickVsModel";
import { PredictionPerformance, PredictionPerformanceSkeleton } from "./PredictionPerformance";
import { RaceSectionCard } from "@/components/raceDetail/RaceSectionCard";
import type { PredictionPerformance as PredictionPerformanceData } from "@/lib/predictionPerformance";
import type { RaceDoc, UserPick } from "@/lib/types/race";

/** Asymmetric, not three equal panels: PickVsModel (the flagship) dominates at ~2/3 width when it
 * has something to show; PredictionPerformance and ModelWatch stack in the remaining column. If
 * there's no pick to compare, the section adapts down to whatever of the other two actually has
 * data — never an empty placeholder box for a visualization with nothing to show. */
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

  if (!hasPickVsModel && !hasPredictionPerf && !hasModelData) return null;

  return (
    <section>
      <h2 className="text-xs font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">Your F1 Intelligence</h2>
      <div className={`mt-4 grid gap-6 ${hasPickVsModel ? "lg:grid-cols-3" : "sm:grid-cols-2"}`}>
        {hasPickVsModel && (
          <div className="lg:col-span-2">
            <RaceSectionCard title="Your pick vs. F1 Hub model">
              <PickVsModel myPick={myPick} nextRace={nextRace} />
            </RaceSectionCard>
          </div>
        )}
        {hasPredictionPerf && (
          <RaceSectionCard title="Your predictions">
            <PredictionPerformance performance={performance} />
          </RaceSectionCard>
        )}
        {hasModelData && (
          <RaceSectionCard title="F1 Hub model watch">
            <ModelWatch nextRace={nextRace} />
          </RaceSectionCard>
        )}
      </div>
    </section>
  );
}

export function IntelligenceSkeleton() {
  return (
    <section>
      <div className="mt-4 grid gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RaceSectionCard title="Your pick vs. F1 Hub model">
            <PickVsModelSkeleton />
          </RaceSectionCard>
        </div>
        <div className="space-y-6">
          <RaceSectionCard title="Your predictions">
            <PredictionPerformanceSkeleton />
          </RaceSectionCard>
          <RaceSectionCard title="F1 Hub model watch">
            <ModelWatchSkeleton />
          </RaceSectionCard>
        </div>
      </div>
    </section>
  );
}
