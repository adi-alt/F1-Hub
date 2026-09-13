"use client";

import type { PredictionReview, PredictionVerdict } from "../../_service/season.pure";

const VERDICT_STYLE: Record<PredictionVerdict, { label: string; className: string }> = {
  correct: { label: "Correct", className: "text-emerald-400" },
  partial: { label: "Partial", className: "text-amber-400" },
  missed: { label: "Missed", className: "text-[var(--f1-red)]" },
};

/**
 * What Apex predicted before the weekend, against what actually happened.
 *
 * Every verdict here is computed (buildPredictionReview), not narrated — the model is explicitly
 * forbidden from scoring its own predictions, because a scorecard nobody can check isn't one.
 * A miss is shown as a miss, plainly and in the same visual weight as a hit; softening that would
 * make the whole section worthless.
 */
export function RacePredictionReview({ review }: { review: PredictionReview }) {
  return (
    <section>
      <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-neutral-500">
        Apex prediction review{" "}
        <span className="font-normal normal-case tracking-normal text-neutral-600">· from the {review.source === "simulation" ? "race simulation" : "finishing-order model"}, frozen before the race</span>
      </p>

      <div className="mt-2.5 divide-y divide-white/[0.055]">
        {review.lines.map((line) => {
          const style = VERDICT_STYLE[line.verdict];
          return (
            <div key={line.label} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <p className="text-xs font-medium text-neutral-300">{line.label}</p>
                <p className={`shrink-0 text-[11px] font-semibold ${style.className}`}>
                  {style.label}
                  {line.detail && <span className="ml-1.5 font-normal text-neutral-500">{line.detail}</span>}
                </p>
              </div>
              <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px]">
                <dt className="text-neutral-600">Predicted</dt>
                <dd className="truncate text-neutral-400">{line.predicted}</dd>
                <dt className="text-neutral-600">Actual</dt>
                <dd className="truncate text-neutral-300">{line.actual}</dd>
              </dl>
            </div>
          );
        })}
      </div>
    </section>
  );
}
