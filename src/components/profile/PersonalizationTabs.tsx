"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { FavoriteEntityList, type FavoriteEntity } from "./FavoriteEntityList";

export type Tab = "players" | "teams" | "circuits";

const TABS: { key: Tab; label: string; type: "driver" | "team" | "track"; nameLabel: string; extraLabel: string }[] = [
  { key: "players", label: "Players", type: "driver", nameLabel: "Driver", extraLabel: "Companies" },
  { key: "teams", label: "Teams", type: "team", nameLabel: "Team", extraLabel: "Home Circuit" },
  { key: "circuits", label: "Circuits", type: "track", nameLabel: "Circuit", extraLabel: "Country" },
];

const PLACEHOLDER: Record<Tab, string> = {
  players: "Search players...",
  teams: "Search teams...",
  circuits: "Search circuits...",
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
  const active = TABS.find((t) => t.key === tab)!;

  function switchTo(next: Tab) {
    setTabState(next);
    setSearch("");
    router.replace(`/profile?section=personalisation&tab=${next}`, { scroll: false });
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex gap-1 rounded-full border border-[var(--f1-line)] bg-black/20 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => switchTo(t.key)}
              className="relative rounded-full px-4 py-1.5 text-sm font-medium transition"
            >
              {t.key === tab && (
                <motion.div
                  layoutId="personalization-tab-capsule"
                  className="absolute inset-0 rounded-full bg-[var(--f1-red)]"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                />
              )}
              <span className={`relative z-10 ${t.key === tab ? "text-white" : "text-neutral-300 hover:text-white"}`}>
                {t.label}
              </span>
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
      <AnimatePresence mode="wait">
        <motion.div
          key={tab}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="mt-4 min-h-0 flex-1 overflow-hidden"
        >
          <FavoriteEntityList
            type={active.type}
            nameLabel={active.nameLabel}
            extraLabel={active.extraLabel}
            items={data.items}
            favoriteIds={data.favoriteIds}
            search={search}
          />
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
