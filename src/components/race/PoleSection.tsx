import type { PolePrediction } from "@/lib/types/race";

export function PoleSection({ polePrediction }: { polePrediction: PolePrediction }) {
  return (
    <div>
      <h3 className="mb-1 text-sm font-semibold uppercase tracking-wide text-neutral-400">
        Predicted pole — {polePrediction.order[0]?.driver ?? "—"}
      </h3>
      <p className="mb-3 text-xs text-neutral-500">
        Prior-season form only, no same-weekend qualifying data — updates automatically as the
        season progresses, until qualifying happens for this race.
      </p>
      <ol className="grid gap-2 sm:grid-cols-2">
        {polePrediction.order.slice(0, 6).map((entry) => (
          <li
            key={entry.driver}
            className="flex items-center justify-between rounded-lg border border-[var(--f1-line)] bg-black/20 px-3 py-2 text-sm"
          >
            <span className="text-white">
              {entry.predictedQualiPosition}. {entry.driver}
            </span>
            <span className="text-xs text-neutral-500">{entry.team}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
