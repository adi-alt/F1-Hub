import type { PracticeData } from "@/lib/types/race";

const SESSION_LABELS: Record<"FP1" | "FP2" | "FP3", string> = { FP1: "Practice 1", FP2: "Practice 2", FP3: "Practice 3" };
const TOP_N = 5;

/** `race.practice` has always been fetched (see pipeline/fetch_races.py's fetch_practice) but,
 * per its own schema comment, was "ML-feature-only, never read by the app's own RaceDoc type" —
 * this is that data's first real display. Sprint weekends only ever have FP1 (no FP2/FP3), so this
 * renders whatever subset actually exists rather than assuming all three. */
export function PracticeSummary({ practice }: { practice: PracticeData }) {
  const sessions = (["FP1", "FP2", "FP3"] as const).filter((key) => practice[key]);
  if (sessions.length === 0) return null;

  return (
    <div className="grid items-stretch gap-4 sm:grid-cols-3">
      {sessions.map((key) => {
        const session = practice[key]!;
        const topLaps = [...session.bestLaps].sort((a, b) => a.lapTimeSec - b.lapTimeSec).slice(0, TOP_N);
        return (
          <div key={key} className="surface-inset rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-neutral-500">{SESSION_LABELS[key]}</p>
            <ol className="space-y-1 text-sm">
              {topLaps.map((lap, i) => (
                <li key={lap.driver} className="flex items-center justify-between gap-3">
                  <span className="text-white">
                    {i + 1}. {lap.driver}
                  </span>
                  <span className="whitespace-nowrap text-neutral-400">
                    {lap.lapTimeSec.toFixed(3)}s{i > 0 ? ` (+${lap.deltaToBestSec.toFixed(3)})` : ""}
                  </span>
                </li>
              ))}
            </ol>
          </div>
        );
      })}
    </div>
  );
}
