"use client";

import { useState } from "react";
import { TabList, TabPanels, Tabs } from "@/components/ui/Tabs";
import { FavoriteEntityList, type FavoriteEntity } from "./FavoriteEntityList";

export type Tab = "players" | "teams" | "circuits";

const TABS: { key: Tab; label: string; type: "driver" | "team" | "track"; nameLabel: string; extraLabel: string }[] = [
  { key: "players", label: "Drivers", type: "driver", nameLabel: "Driver", extraLabel: "Teams" },
  { key: "teams", label: "Teams", type: "team", nameLabel: "Team", extraLabel: "Most raced at" },
  { key: "circuits", label: "Circuits", type: "track", nameLabel: "Circuit", extraLabel: "Country" },
];

const PLACEHOLDER: Record<Tab, string> = {
  players: "Search drivers…",
  teams: "Search teams…",
  circuits: "Search circuits…",
};

/** One tab at a time, not all three stacked — the same switch-instantly pattern the archive's own
 * By year/track/driver/team tabs use. The active tab is also reflected in the URL
 * (/profile?section=personalisation&tab=...) so it's linkable/refreshable, but switching tabs is
 * still instant: local state drives the UI immediately, the history API just syncs the URL (no server round trip)
 * afterward rather than the tab click waiting on a server round-trip. */
export function PersonalizationTabs({
  initialTab,
  players,
  teams,
  circuits,
}: {
  initialTab: Tab;
  players: { items: FavoriteEntity[]; favoriteIds: string[] };
  teams: { items: FavoriteEntity[]; favoriteIds: string[] };
  circuits: { items: FavoriteEntity[]; favoriteIds: string[] };
}) {
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [search, setSearch] = useState("");
  const data = { players, teams, circuits }[tab];
  const active = TABS.find((t) => t.key === tab)!;

  function switchTo(next: Tab) {
    setTabState(next);
    setSearch("");
    window.history.replaceState(window.history.state, "", `/profile/personalisation?kind=${next}`);
  }

  return (
    <Tabs variant="segmented" value={tab} onValueChange={switchTo} items={TABS.map((t) => ({ value: t.key, label: t.label }))}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <TabList aria-label="What to favourite" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={PLACEHOLDER[tab]}
          aria-label={PLACEHOLDER[tab]}
          className="h-9 w-full rounded-control border border-white/[0.08] bg-white/[0.02] px-3 text-body-sm text-primary placeholder:text-tertiary focus-visible:border-white/25 focus-visible:outline-2 focus-visible:outline-focus-ring sm:w-64"
        />
      </div>
      <TabPanels className="mt-4">
        <FavoriteEntityList type={active.type} nameLabel={active.nameLabel} extraLabel={active.extraLabel} items={data.items} favoriteIds={data.favoriteIds} search={search} />
      </TabPanels>
    </Tabs>
  );
}
