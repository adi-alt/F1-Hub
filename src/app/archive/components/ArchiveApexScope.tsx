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

/**
 * The "By Track" tab's own scope - same rule as ArchiveYearBrowserApexScope: only the visible
 * filter selection goes over the wire (search/active-historical/country/favorites-only), under
 * `snapshot.view: "trackBrowser"`. The server resolves it against the real circuit index
 * (buildArchiveTrackBrowserGroundingContext), reusing the exact same active/historical
 * reconciliation (getActiveIds) the grid's own status badges already use - never a second
 * definition of "active."
 */
export function ArchiveTrackBrowserApexScope({
  search,
  status,
  country,
  favoritesOnly,
}: {
  search: string;
  status: "all" | "active" | "historical";
  country: string;
  favoritesOnly: boolean;
}) {
  const trimmedSearch = search.trim();

  const suggestions: string[] = [];
  if (trimmedSearch) {
    suggestions.push(`Tell me about ${trimmedSearch}'s history`, `Who has won the most races at ${trimmedSearch}?`);
  } else if (status === "active") {
    suggestions.push("Which tracks are on the current calendar?");
  } else if (status === "historical") {
    suggestions.push("Which historic circuits disappeared from F1?");
  } else if (country) {
    suggestions.push(`Which circuits has ${country} hosted?`);
  } else {
    suggestions.push("Which track has hosted the most F1 races?", "Compare two circuits");
  }
  suggestions.push("Most important circuits in F1 history");

  useRegisterApexScope({
    key: "archive:track-browser",
    label: "F1 Circuits",
    sublabel: status !== "all" ? (status === "active" ? "Active tracks" : "Historical tracks") : (country || "1950–Present"),
    context: {
      page: "archive",
      snapshot: {
        view: "trackBrowser",
        search: trimmedSearch || undefined,
        status: status !== "all" ? status : undefined,
        country: country || undefined,
        favoritesOnly: favoritesOnly || undefined,
      },
    },
    suggestions: suggestions.slice(0, 4),
  });

  return null;
}

/**
 * The "By Driver" tab's own scope - same rule again: search/favorites-only selection state only,
 * under `snapshot.view: "driverBrowser"`. The server resolves it against the real driver index
 * (buildArchiveDriverBrowserGroundingContext), capped to a bounded, most-relevant subset - see
 * that builder's own comment for why the full 800+ row index is never sent as-is.
 */
export function ArchiveDriverBrowserApexScope({ search, favoritesOnly }: { search: string; favoritesOnly: boolean }) {
  const trimmedSearch = search.trim();

  const suggestions: string[] = [];
  if (trimmedSearch) {
    suggestions.push(`Tell me about ${trimmedSearch}'s career`, `Compare ${trimmedSearch} with another driver`);
  } else if (favoritesOnly) {
    suggestions.push("Compare my favorite drivers");
  } else {
    suggestions.push("Who has the longest career on record?", "Which drivers raced for the most constructors?");
  }
  suggestions.push("Compare two drivers");

  useRegisterApexScope({
    key: "archive:driver-browser",
    label: "F1 Drivers",
    sublabel: trimmedSearch ? `Search: ${trimmedSearch}` : favoritesOnly ? "Favorites" : "All-time roster",
    context: {
      page: "archive",
      snapshot: {
        view: "driverBrowser",
        search: trimmedSearch || undefined,
        favoritesOnly: favoritesOnly || undefined,
      },
    },
    suggestions: suggestions.slice(0, 4),
  });

  return null;
}

/**
 * The "By Team" tab's own scope - same shape as the driver browser above, under
 * `snapshot.view: "teamBrowser"`. The server resolves it against the real constructor index
 * (buildArchiveTeamBrowserGroundingContext), including the same active/historical reconciliation
 * the track browser uses (getActiveIds also returns team ids, not a separate lookup).
 */
export function ArchiveTeamBrowserApexScope({ search, favoritesOnly }: { search: string; favoritesOnly: boolean }) {
  const trimmedSearch = search.trim();

  const suggestions: string[] = [];
  if (trimmedSearch) {
    suggestions.push(`Tell me about ${trimmedSearch}'s history`, `Which drivers have raced for ${trimmedSearch}?`);
  } else if (favoritesOnly) {
    suggestions.push("Compare my favorite teams");
  } else {
    suggestions.push("Which constructors are active this season?", "Which team has the most race entries?");
  }
  suggestions.push("Compare two teams");

  useRegisterApexScope({
    key: "archive:team-browser",
    label: "F1 Constructors",
    sublabel: trimmedSearch ? `Search: ${trimmedSearch}` : favoritesOnly ? "Favorites" : "All-time roster",
    context: {
      page: "archive",
      snapshot: {
        view: "teamBrowser",
        search: trimmedSearch || undefined,
        favoritesOnly: favoritesOnly || undefined,
      },
    },
    suggestions: suggestions.slice(0, 4),
  });

  return null;
}
