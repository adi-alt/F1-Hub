"use client";

import { useMemo } from "react";
import { Section } from "@/components/ui/Section";
import { useSeasonExplorer } from "../../_context/SeasonExplorerContext";
import type { RaceSummary } from "../../_service/season.pure";
import { championshipInsights } from "../../_utils/championship";

/**
 * Evidence-backed insights in place of narrative cards: each is computed from the round-by-round points (see
 * championshipInsights), shown only when its data exists, and says how it is measured. Follows the page's
 * drivers/constructors switch. No model-written text.
 */
export function SeasonInsights({ year, raceSummaries }: { year: number; raceSummaries: RaceSummary[] }) {
  const { entityType } = useSeasonExplorer();
  const insights = useMemo(() => championshipInsights(raceSummaries, entityType, year), [raceSummaries, entityType, year]);
  if (insights.length === 0) return null;
  return (
    <Section id="season-insights" level={2} title="Form and the fight" description={`Measured from every completed round, ${entityType === "drivers" ? "drivers" : "constructors"}.`}>
      <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {insights.map((i) => (
          <li key={i.id} className="flex min-w-0 flex-col rounded-card bg-surface-1 p-5">
            <p className="text-caption text-secondary">{i.title}</p>
            <p className="mt-2 text-display-md tabular text-primary">{i.value}</p>
            <p className="mt-1 text-body-sm text-primary">{i.detail}</p>
            <p className="mt-auto pt-4 text-caption text-tertiary">{i.basis}</p>
          </li>
        ))}
      </ul>
    </Section>
  );
}
