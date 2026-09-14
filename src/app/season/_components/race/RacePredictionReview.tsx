"use client";

import type { PredictionReview, PredictionVerdict, RaceSummary } from "../../_service/season.pure";

const VERDICT: Record<PredictionVerdict, { label: string; className: string }> = {
  correct: { label: "Correct", className: "text-emerald-400" },
  partial: { label: "Partial", className: "text-amber-400" },
  missed: { label: "Missed", className: "text-[var(--f1-red)]" },
};

/**
 * What Apex predicted before the weekend, against what actually happened.
 *
 * Laid out as two labelled columns because that is the only arrangement in which a prediction
 * cannot be mistaken for a result. The predicted side is deliberately quieter (muted text, dashed
 * left rule) and the actual side is the one that reads as fact.
 *
 * Every verdict is computed (buildPredictionReview), never narrated - the model is explicitly
 * forbidden from scoring its own predictions, because a scorecard nobody can check isn't one. A
 * miss is shown as a miss, at the same visual weight as a hit.
 */
export function RacePredictionReview({ review, race }: { review: PredictionReview; race: RaceSummary }) {
  const predictedPodium = review.lines.find((l) => l.label === "Podium");
  const actualPodium = race.podium;
  const correctCount = review.lines.filter((l) => l.verdict === "correct").length;

  return (
    <section>
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">Predicted vs actual</p>
        <p className="text-[11px] text-neutral-600">
          from the {review.source === "simulation" ? "race simulation" : "finishing-order model"}, frozen before the race ·{" "}
          <span className="text-neutral-400">
            {correctCount} of {review.lines.length} correct
          </span>
        </p>
      </div>

      {/* Podium side by side, position for position - the comparison people actually want. */}
      {predictedPodium && actualPodium.length === 3 && (
        <div className="mt-3 grid grid-cols-2 gap-4">
          <Column
            heading="Predicted"
            muted
            rows={predictedPodium.predicted.split(", ").map((name, i) => ({
              position: i + 1,
              name,
              hit: actualPodium.some((p) => p.driverName === name),
            }))}
          />
          <Column
            heading="Actual"
            rows={actualPodium.map((p) => ({
              position: p.position,
              name: p.driverName,
              hit: predictedPodium.predicted.split(", ").includes(p.driverName),
            }))}
          />
        </div>
      )}

      {/* Every scored line, including ones without a podium to lay out. */}
      <div className="mt-4 divide-y divide-white/[0.055]">
        {review.lines.map((line) => {
          const v = VERDICT[line.verdict];
          return (
            <div key={line.label} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 py-2">
              <p className="text-xs font-medium text-neutral-300">{line.label}</p>
              <div className="flex min-w-0 flex-1 flex-wrap items-baseline justify-end gap-x-4 gap-y-0.5 text-[11px]">
                <p className="truncate text-neutral-500">
                  <span className="text-neutral-600">predicted</span> {line.predicted}
                </p>
                <p className="truncate text-neutral-300">
                  <span className="text-neutral-600">actual</span> {line.actual}
                </p>
                <p className={`shrink-0 font-semibold ${v.className}`}>
                  {v.label}
                  {line.detail && <span className="ml-1.5 font-normal text-neutral-500">{line.detail}</span>}
                </p>
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}

function Column({
  heading,
  rows,
  muted = false,
}: {
  heading: string;
  rows: { position: number; name: string; hit: boolean }[];
  muted?: boolean;
}) {
  return (
    <div className={muted ? "border-l border-dashed border-white/[0.12] pl-3" : "border-l border-white/[0.12] pl-3"}>
      <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">{heading}</p>
      <ol className="mt-1.5 space-y-1">
        {rows.map((r) => (
          <li key={`${r.position}-${r.name}`} className="flex items-baseline gap-2 text-sm">
            <span className="w-5 shrink-0 font-mono text-[11px] tabular-nums text-neutral-600">P{r.position}</span>
            <span className={`min-w-0 truncate ${muted ? "text-neutral-400" : "text-neutral-200"}`}>{r.name}</span>
            {/* A tick marks a driver who appears on both sides. It is never the only signal -
                the two columns are labelled, and the verdict rows below state the outcome. */}
            {r.hit && (
              <span className="shrink-0 text-[11px] text-emerald-400" aria-label="also on the other side">
                ✓
              </span>
            )}
          </li>
        ))}
      </ol>
    </div>
  );
}
