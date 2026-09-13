"use client";

import type { AvailableInsight } from "@/lib/ai/schemas/raceIntelligence";

const PANELS: { key: "strategyInsight" | "racePaceInsight" | "championshipImpact"; label: string }[] = [
  { key: "strategyInsight", label: "Strategy" },
  { key: "racePaceInsight", label: "Race Pace" },
  { key: "championshipImpact", label: "Championship" },
];

/** Only ever renders the panels the model (or the deterministic fallback) actually marked
 * `available: true` for this race - `null` and `available: false` both mean "genuinely nothing
 * honest to say here," never papered over with generic filler. */
export function StrategyPanels({
  strategyInsight,
  racePaceInsight,
  championshipImpact,
}: {
  strategyInsight: AvailableInsight | null;
  racePaceInsight: AvailableInsight | null;
  championshipImpact: AvailableInsight | null;
}) {
  const insights = { strategyInsight, racePaceInsight, championshipImpact };
  const visible = PANELS.filter((p) => insights[p.key]?.available);
  if (visible.length === 0) return null;

  return (
    <div className={`grid gap-3 ${visible.length === 1 ? "" : visible.length === 2 ? "sm:grid-cols-2" : "sm:grid-cols-3"}`}>
      {visible.map((p) => {
        const insight = insights[p.key]!;
        return (
          <div key={p.key} className="rounded-lg border border-white/[0.06] bg-white/[0.02] p-3">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-neutral-500">{p.label}</p>
            <p className="mt-1 text-sm font-medium text-white">{insight.title}</p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-400">{insight.explanation}</p>
          </div>
        );
      })}
    </div>
  );
}
