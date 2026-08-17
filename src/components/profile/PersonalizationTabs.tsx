"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { FavoriteEntityList, type FavoriteEntity } from "./FavoriteEntityList";

export type Tab = "players" | "teams" | "circuits";

const TABS: { key: Tab; label: string; type: "driver" | "team" | "track" }[] = [
  { key: "players", label: "Players", type: "driver" },
  { key: "teams", label: "Teams", type: "team" },
  { key: "circuits", label: "Circuits", type: "track" },
];

const PLACEHOLDER: Record<Tab, string> = {
  players: "Search players…",
  teams: "Search teams…",
  circuits: "Search circuits…",
};

/** One tab at a time, not all three stacked — the same switch-instantly pattern the archive's own
 * By year/track/driver/team tabs use. The active tab is also reflected in the URL
 * (/profile?section=personalisation&tab=...) so it's linkable/refreshable, but switching tabs is
 * still instant: local state drives the UI immediately, router.replace just syncs the URL
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
  const router = useRouter();
  const [tab, setTabState] = useState<Tab>(initialTab);
  const [search, setSearch] = useState("");
  const data = { players, teams, circuits }[tab];
  const type = TABS.find((t) => t.key === tab)!.type;

  function switchTo(next: Tab) {
    setTabState(next);
    setSearch("");
    router.replace(`/profile?section=personalisation&tab=${next}`, { scroll: false });
  }

  return (
    <div className="flex flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => switchTo(t.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                t.key === tab
                  ? "bg-[var(--f1-red)] text-white"
                  : "border border-[var(--f1-line)] text-neutral-300 hover:border-white/30 hover:text-white"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={PLACEHOLDER[tab]}
          className="w-full max-w-xs rounded-full border border-[var(--f1-line)] bg-black/20 px-4 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-white/40 focus:outline-none"
        />
      </div>
      <div className="mt-4 flex-1 overflow-hidden">
        <FavoriteEntityList type={type} items={data.items} favoriteIds={data.favoriteIds} search={search} />
      </div>
    </div>
  );
}
