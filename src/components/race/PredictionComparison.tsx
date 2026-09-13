import type { PredictionAccuracy } from "@/lib/predictionAccuracy";

export function PredictionComparison({ accuracy }: { accuracy: PredictionAccuracy }) {
  return (
    <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-4">
      <div className="flex flex-wrap items-center gap-2">
        <p className="text-xs uppercase tracking-wide text-neutral-500">Pre-race prediction vs actual</p>
        {/* Set only by pipeline/reconstruct_prediction.py — a real prediction that never got
            frozen live before this race ran (see RacePrediction.source's own comment), computed
            after the fact from the same real pre-race inputs a live run would have used. Labeled
            rather than shown identically to a genuine frozen call, so this can never be mistaken
            for the model having actually called it in advance. */}
        {accuracy.reconstructed && (
          <span
            title="Computed after the race from the same real pre-race inputs a live run would have used — this race's own qualifying-to-race-day window closed before a prediction was ever frozen."
            className="rounded-sm bg-amber-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-400"
          >
            Reconstructed
          </span>
        )}
      </div>
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
