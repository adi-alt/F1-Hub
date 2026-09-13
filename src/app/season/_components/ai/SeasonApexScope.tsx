"use client";

import { useRegisterApexScope } from "@/components/apex/ApexScopeProvider";
import { useSeasonExplorer } from "../../_context/SeasonExplorerContext";

/**
 * Season's contribution to the ONE global Ask Apex.
 *
 * There is deliberately no Season-specific Ask Apex UI. The launcher, its placement, its panel,
 * its animation and its keyboard behaviour are the single global implementation mounted in the
 * root layout — the homepage doesn't own a special version of it and neither does this page. The
 * only thing that varies per page is the scope registered here.
 *
 * What gets sent is UI SELECTION STATE ONLY: the season, which championship is showing, which
 * analysis tab is open, which two entities are selected in Compare, and which race window is
 * open. No standings, no points, no battle data. The route resolves those ids against
 * authoritative data server-side (see buildSeasonGroundingContext) — a client cannot supply the
 * facts Apex reasons over, only say what it is looking at.
 *
 * Renders nothing.
 */
export function SeasonApexScope({ season }: { season: number }) {
  const { entityType, analysisTab, compareA, compareB, openRaceRound } = useSeasonExplorer();

  // Only questions the registered scope can actually answer. A starter that leads somewhere Apex
  // has to decline is worse than no starter.
  const suggestions: string[] = [];
  if (openRaceRound !== null) {
    suggestions.push("What should I know about this round?", "How does this race affect the championship?");
  } else if (analysisTab === "compare" && compareA && compareB && compareA !== compareB) {
    suggestions.push("What separates these two?", "Who has been stronger recently?");
  } else if (analysisTab === "battles") {
    suggestions.push("Which championship battle is tightest?", "Where is the momentum going?");
  } else if (analysisTab === "records") {
    suggestions.push("Which record matters most this season?");
  } else if (analysisTab === "progression") {
    suggestions.push("When did the championship start to turn?", "Who is gaining ground?");
  }
  suggestions.push("What's the story of this season?", "What changed in the latest round?");

  useRegisterApexScope({
    // The key changes when the open race does, which resets the transcript — answers grounded in
    // one round's facts would be misleading carried into another's.
    key: openRaceRound !== null ? `season:${season}:race:${openRaceRound}` : `season:${season}`,
    label: `Season ${season}`,
    sublabel: openRaceRound !== null ? `Round ${openRaceRound}` : "Intelligence",
    context: {
      page: "season",
      season,
      selectedChampionship: entityType,
      selectedAnalysisTab: analysisTab,
      entityAId: compareA || undefined,
      entityBId: compareB || undefined,
      selectedRaceId: openRaceRound !== null ? String(openRaceRound) : undefined,
    },
    suggestions: suggestions.slice(0, 4),
  });

  return null;
}
