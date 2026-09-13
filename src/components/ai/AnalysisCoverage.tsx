"use client";

import { useState } from "react";
import type { ContextSource } from "@/lib/ai/schemas/raceIntelligence";

// Human labels for the 11 real ContextSource keys - same union raceContext.ts's dataCoverage and
// evidenceFactCounts are keyed by. Order here is display order.
const COVERAGE_LABELS: [ContextSource, string][] = [
  ["classification", "Race classification"],
  ["championship", "Championship impact"],
  ["weather", "Weather conditions"],
  ["tireStrategy", "Tire strategy"],
  ["compoundPace", "Compound pace"],
  ["traffic", "Traffic & gaps"],
  ["safetyCar", "Safety car periods"],
  ["keyMoments", "Key moments"],
  ["trackHistory", "Track history"],
  ["favoriteDriver", "Your driver"],
  ["favoriteTeam", "Your team"],
];

/** Reused two ways: `mode="checklist"` is the instant, pre-generation list (computed client-side
 * from props already in hand - see IntelligenceLoadingState). `mode="behind"` is the post-
 * generation "Behind This Analysis" panel (renamed from "Show Evidence" - these are real sources
 * the generation had access to, not literal citations) - collapsed to a one-line count, expandable
 * to the full list with real per-source fact counts. */
export function AnalysisCoverage({
  coverage,
  factCounts,
  mode,
}: {
  coverage: Partial<Record<ContextSource, boolean>>;
  factCounts?: Partial<Record<ContextSource, number>>;
  mode: "checklist" | "behind";
}) {
  const [expanded, setExpanded] = useState(false);
  const items = COVERAGE_LABELS.filter(([key]) => key in coverage);
  const available = items.filter(([key]) => coverage[key]).length;

  if (mode === "checklist") {
    return (
      <ul className="space-y-1.5">
        {items.map(([key, label]) => (
          <li key={key} className="flex items-center gap-2 text-xs text-neutral-400">
            <span className={`h-1.5 w-1.5 rounded-full ${coverage[key] ? "bg-emerald-400" : "bg-white/15"}`} />
            {label}
          </li>
        ))}
      </ul>
    );
  }

  return (
    <div className="border-t border-[var(--f1-line)] pt-3.5">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between text-left text-xs text-neutral-500 transition hover:text-neutral-300"
      >
        <span>
          Behind this analysis · {available} of {items.length} race data sources available
        </span>
        <span>{expanded ? "Hide ↑" : "Show ↓"}</span>
      </button>
      {expanded && (
        <ul className="mt-3 space-y-1.5">
          {items.map(([key, label]) => (
            <li key={key} className="flex items-center justify-between text-xs">
              <span className="flex items-center gap-2 text-neutral-400">
                <span className={`h-1.5 w-1.5 rounded-full ${coverage[key] ? "bg-emerald-400" : "bg-white/15"}`} />
                {label}
              </span>
              <span className="text-neutral-600">{coverage[key] ? `${factCounts?.[key] ?? 0} fact${(factCounts?.[key] ?? 0) === 1 ? "" : "s"}` : "unavailable"}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
