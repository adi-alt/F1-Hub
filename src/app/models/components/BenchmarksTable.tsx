import type { ModelBenchmark } from "@/lib/supabase/modelBenchmarks";

/** `aggregate`'s keys vary per model — shown as whatever's there, not a fixed column set, since
 * hardcoding e.g. Pace's MAE/R2/Spearman would silently drop the simulator's Brier-score fields. */
export function BenchmarksTable({ benchmarks }: { benchmarks: ModelBenchmark[] }) {
  if (benchmarks.length === 0) {
    return <p className="text-sm text-neutral-500">No benchmarks recorded yet.</p>;
  }

  return (
    <div className="space-y-3">
      {benchmarks.map((b) => (
        <div key={b.id} className="rounded-lg border border-[var(--f1-line)] bg-black/20 px-4 py-3">
          <div className="flex items-baseline justify-between gap-4">
            <span className="font-semibold text-white">{b.id}</span>
            <span className="text-xs text-neutral-500">{new Date(b.evaluatedAt).toLocaleString()}</span>
          </div>
          <dl className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-sm">
            {Object.entries(b.aggregate)
              .filter(([key]) => key !== "seasons")
              .map(([key, value]) => (
                <div key={key} className="flex gap-1.5">
                  <dt className="text-neutral-500">{key}:</dt>
                  <dd className="text-neutral-200">{Array.isArray(value) ? value.join(", ") : String(value)}</dd>
                </div>
              ))}
          </dl>
        </div>
      ))}
    </div>
  );
}
