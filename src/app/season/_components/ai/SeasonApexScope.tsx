"use client";

import { useRegisterApexScope } from "@/components/apex/ApexScopeProvider";
import { useSeasonExplorer } from "../../_context/SeasonExplorerContext";

/** Must be rendered inside <SeasonExplorerProvider> - it reads the live tab/entity-type/compare
 * selection straight from that context instead of taking it as props, so the registered scope
 * (and Ask Apex's suggestions) update automatically as the user switches tabs, with no extra
 * prop-threading through SeasonDetail. */
export function SeasonApexScope({ season }: { season: number }) {
  const { entityType, analysisTab, compareA, compareB } = useSeasonExplorer();

  const suggestions = ["What's the overall story of this season?"];
  if (analysisTab === "compare" && compareA && compareB && compareA !== compareB) {
    suggestions.unshift("What separates these two in this matchup?", "Who has been stronger recently?");
  } else if (analysisTab === "battles") {
    suggestions.unshift("Which championship battle is the tightest?", "Who is winning the momentum?");
  } else if (analysisTab === "records") {
    suggestions.unshift("What is the most impressive record this season?");
  } else if (analysisTab === "progression") {
    suggestions.unshift("When did the championship start to change?", "Who is gaining momentum?");
  } else {
    suggestions.push("What changed recently in the standings?", "Who is currently in the best form?");
  }

  useRegisterApexScope({
    key: `season:${season}`,
    label: `Season ${season}`,
    sublabel: "Intelligence",
    context: {
      page: "season",
      season,
      selectedChampionship: entityType,
      selectedAnalysisTab: analysisTab,
      entityAId: compareA || undefined,
      entityBId: compareB || undefined,
    },
    suggestions: suggestions.slice(0, 4),
  });

  return null;
}
