import { FeatureImportanceChart } from "@/components/charts/FeatureImportanceChart";
import { PaceChart } from "@/components/charts/PaceChart";
import { PoleSection } from "@/components/race/PoleSection";
import type { PolePrediction, RacePrediction } from "@/lib/types/race";

export function PredictionPanel({
  prediction,
  polePrediction,
}: {
  prediction: RacePrediction;
  polePrediction?: PolePrediction;
}) {
  return (
    <div className="space-y-6">
      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Predicted finishing order
        </h3>
        <ol className="grid gap-2 sm:grid-cols-2">
          {prediction.finishOrder.map((entry) => (
            <li
              key={entry.driver}
              className="flex items-center justify-between rounded-lg border border-[var(--f1-line)] bg-black/20 px-4 py-2.5"
            >
              <span className="font-semibold text-white">
                {entry.predictedPosition}. {entry.driver}
              </span>
              <span className="text-xs text-neutral-500">
                {entry.team}
                {entry.spread !== null ? ` · ±${entry.spread.toFixed(1)}` : ""}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {polePrediction && <PoleSection polePrediction={polePrediction} />}

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          Predicted race pace (gap to fastest lap)
        </h3>
        <PaceChart paceGapSec={prediction.predictedPaceGapSec} />
      </div>

      <div>
        <h3 className="mb-3 text-sm font-semibold uppercase tracking-wide text-neutral-400">
          What the finish-order model weighs
        </h3>
        <FeatureImportanceChart importance={prediction.finishFeatureImportance} />
      </div>
    </div>
  );
}
