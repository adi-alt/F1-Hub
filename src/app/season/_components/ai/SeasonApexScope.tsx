"use client";

import { useRegisterApexScope } from "@/components/apex/ApexScopeProvider";

export function SeasonApexScope({
  season,
  selectedChampionship,
  selectedAnalysisTab,
  selectedRaceId,
  entityAId,
  entityBId,
  selectedDriverId,
  selectedTeamId,
}: {
  season: number;
  selectedChampionship?: "drivers" | "constructors";
  selectedAnalysisTab?: string;
  selectedRaceId?: string;
  entityAId?: string;
  entityBId?: string;
  selectedDriverId?: string;
  selectedTeamId?: string;
}) {
  // Generate suggestions based on context
  const suggestions = ["What's the overall story of this season?"];

  if (selectedAnalysisTab === "compare" && entityAId && entityBId && entityAId !== entityBId) {
    suggestions.unshift("What separates these two in this matchup?", "Who has been stronger recently?");
  } else if (selectedAnalysisTab === "battles") {
    suggestions.unshift("Which championship battle is the tightest?", "Who is winning the momentum?");
  } else if (selectedAnalysisTab === "records") {
    suggestions.unshift("What is the most impressive record this season?");
  } else if (selectedRaceId) {
    suggestions.unshift("Why is this race important for the championship?", "What could change after this round?");
  } else {
    suggestions.push("What changed recently in the standings?", "Who is currently in the best form?");
  }

  useRegisterApexScope({
    key: "season",
    label: `Season ${season}`,
    sublabel: "Intelligence",
    context: {
      page: "season",
      season,
      selectedChampionship,
      selectedAnalysisTab,
      selectedRaceId,
      entityAId,
      entityBId,
      selectedDriverId,
      selectedTeamId,
    },
    suggestions: suggestions.slice(0, 4), // keep it bounded
  });

  return null;
}
