import type { PolePredictionAccuracy } from "@/lib/predictionAccuracy";

export function PolePredictionComparison({ accuracy }: { accuracy: PolePredictionAccuracy }) {
  return (
    <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-5">
      <p className="text-xs uppercase tracking-wide text-neutral-500">
        Pole prediction vs actual (prior-form model)
      </p>
      <div className="mt-3 flex flex-wrap gap-x-8 gap-y-3 text-sm">
        <div>
          <span className="text-neutral-500">Predicted </span>
          <span className="font-semibold text-white">{accuracy.predictedPole}</span>
        </div>
        <div>
          <span className="text-neutral-500">Actual </span>
          <span className="font-semibold text-white">{accuracy.actualPole}</span>
        </div>
        <div>
          <span className="text-neutral-500">Hit </span>
          <span className="font-semibold text-white">{accuracy.hit ? "Yes" : "No"}</span>
        </div>
      </div>
    </div>
  );
}
