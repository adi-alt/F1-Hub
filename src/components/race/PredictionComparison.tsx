import type { PredictionAccuracy } from "@/lib/predictionAccuracy";

export function PredictionComparison({ accuracy }: { accuracy: PredictionAccuracy }) {
  return (
    <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-4">
      <p className="text-xs uppercase tracking-wide text-neutral-500">Pre-race prediction vs actual</p>
      <div className="mt-2.5 flex flex-wrap gap-x-6 gap-y-2 text-sm">
        <div>
          <span className="text-neutral-500">Predicted winner </span>
          <span className="font-semibold text-white">{accuracy.predictedWinner}</span>
        </div>
        <div>
          <span className="text-neutral-500">Actual winner </span>
          <span className="font-semibold text-white">{accuracy.actualWinner}</span>
        </div>
        <div>
          <span className="text-neutral-500">Podium hits </span>
          <span className="font-semibold text-white">{accuracy.podiumHits}/3</span>
        </div>
        <div>
          <span className="text-neutral-500">Position MAE </span>
          <span className="font-semibold text-white">{accuracy.positionMAE.toFixed(2)}</span>
        </div>
      </div>
    </div>
  );
}
