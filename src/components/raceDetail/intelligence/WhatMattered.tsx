"use client";

import type { RaceInsight } from "@/lib/ai/schemas/raceIntelligence";
import { StrategyPanels } from "./StrategyPanels";
import type { AvailableInsight } from "@/lib/ai/schemas/raceIntelligence";

/** Level 2 - What Mattered: numbered key factors, FACT vs ANALYSIS styled distinctly (a claim
 * about what a driver said or a stat that already happened reads differently from the model's own
 * interpretation of why it mattered - the badge keeps that boundary visible, not just implied by
 * prose tone), plus whichever Strategy/Race Pace/Championship panels are genuinely available. */
export function WhatMattered({
  keyFactors,
  strategyInsight,
  racePaceInsight,
  championshipImpact,
}: {
  keyFactors: RaceInsight[];
  strategyInsight: AvailableInsight | null;
  racePaceInsight: AvailableInsight | null;
  championshipImpact: AvailableInsight | null;
}) {
  return (
    <div className="space-y-4 border-t border-[var(--f1-line)] pt-4">
      <ol className="space-y-3">
        {keyFactors.map((factor, i) => (
          <li key={i} className="flex gap-3">
            <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-white/[0.06] text-[11px] font-semibold text-neutral-400">{i + 1}</span>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium text-white">{factor.title}</p>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide ${
                    factor.claimType === "fact" ? "bg-emerald-400/10 text-emerald-400" : "bg-sky-400/10 text-sky-400"
                  }`}
                >
                  {factor.claimType}
                </span>
              </div>
              <p className="mt-0.5 text-xs leading-relaxed text-neutral-400">{factor.explanation}</p>
            </div>
          </li>
        ))}
      </ol>
      <StrategyPanels strategyInsight={strategyInsight} racePaceInsight={racePaceInsight} championshipImpact={championshipImpact} />
    </div>
  );
}
