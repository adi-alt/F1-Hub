"use client";

import { useRegisterApexScope } from "@/components/apex/ApexScopeProvider";
import { ERAS } from "@/lib/eras";

const SUGGESTIONS: Record<"driver" | "team" | "circuit", string[]> = {
  driver: ["What was this driver's strongest period?", "Which teams did they drive for?", "What's their best result here?"],
  team: ["Which era produced the most wins?", "Which drivers contributed most to this team?", "How has this team's record changed over time?"],
  circuit: ["Who has the strongest record here?", "How has this circuit changed over time?", "What's the closest finish on record here?"],
};

/**
 * Archive's contribution to the ONE global Ask Apex - same placement, same panel, same
 * interaction model as every other page (SeasonApexScope, CircuitApexScope). Only the scope
 * changes: an entity type and id, both safe UI selection state - never a client-computed
 * statistic. The server resolves those against authoritative archive data
 * (buildArchiveGroundingContext in the ask-apex route) before any of it reaches a prompt.
 */
export function ArchiveApexScope({
  entityType,
  entityId,
  name,
}: {
  entityType: "driver" | "team" | "circuit";
  entityId: string;
  name: string;
}) {
  useRegisterApexScope({
    key: `archive:${entityType}:${entityId}`,
    label: name,
    sublabel: entityType === "driver" ? "Career record" : entityType === "team" ? "Constructor history" : "Circuit history",
    context: {
      page: "archive",
      snapshot: { entityType, entityId },
    },
    suggestions: SUGGESTIONS[entityType],
  });

  return null;
}

/**
 * The "By Year" tab's own contribution to the ONE global Ask Apex - this was the actual regression:
 * every Archive entity page (driver/team/circuit above, season detail via SeasonApexScope) already
 * registers a scope, but the year-browsing grid itself (ArchiveExplorer's `facet === "year"`) never
 * did, so Apex simply didn't render there. Same rule as every other scope here: only era/search
 * selection state goes over the wire, under `snapshot.view: "yearBrowser"` so the route can tell it
 * apart from the entity-page snapshot shape above. The server resolves the real per-season
 * champion/leader index against getArchiveYearStatsData (buildArchiveYearBrowserGroundingContext in
 * the ask-apex route) - the same cached, authoritative source the year cards' own hover tooltip
 * already renders from, never a client-computed statistic.
 *
 * `key` is deliberately stable regardless of era/search - the exact pattern SeasonApexScope already
 * uses for its own tab/compare-selection changes: typing in the search box or switching the era
 * filter updates what Apex can see without resetting an in-progress conversation. Only actually
 * leaving the tab (unmounting this component) clears the scope.
 */
export function ArchiveYearBrowserApexScope({ era, searchQuery }: { era: string; searchQuery: string }) {
  const trimmedSearch = searchQuery.trim();
  const eraName = era !== "all" ? ERAS.find((e) => e.id === era)?.name : undefined;

  // Only questions the registered scope can actually answer - a search for one year narrows
  // straight to that season, an era filter narrows to that era's story, and unfiltered browsing
  // gets the broad, cross-era questions the full champion index can actually ground.
  const suggestions: string[] = [];
  if (trimmedSearch) {
    suggestions.push(`What happened in the ${trimmedSearch} season?`, "Who won the championship that year?");
  } else if (eraName) {
    suggestions.push(`Which driver dominated the ${eraName}?`, "What changed with this era?");
  } else {
    suggestions.push("What was the closest championship battle?", "Which era had the most dominant drivers?");
  }
  suggestions.push("Compare two seasons");

  useRegisterApexScope({
    key: "archive:year-browser",
    label: "F1 Seasons",
    sublabel: eraName ?? "1950–Present",
    context: {
      page: "archive",
      snapshot: {
        view: "yearBrowser",
        era: era !== "all" ? era : undefined,
        searchQuery: trimmedSearch || undefined,
      },
    },
    suggestions: suggestions.slice(0, 4),
  });

  return null;
}
