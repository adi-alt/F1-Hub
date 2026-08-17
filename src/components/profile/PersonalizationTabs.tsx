"use client";

import { useState } from "react";
import { FavoriteEntityList, type FavoriteEntity } from "./FavoriteEntityList";

type Tab = "players" | "teams" | "circuits";

const TABS: { key: Tab; label: string; type: "driver" | "team" | "track" }[] = [
  { key: "players", label: "Players", type: "driver" },
  { key: "teams", label: "Teams", type: "team" },
  { key: "circuits", label: "Circuits", type: "track" },
];

/** One tab at a time, not all three stacked — the same switch-instantly pattern the archive's own
 * By year/track/driver/team tabs use, so favoriting a driver doesn't mean scrolling past two other
 * full paginated lists to get there. */
export function PersonalizationTabs({
  players,
  teams,
  circuits,
}: {
  players: { items: FavoriteEntity[]; favoriteIds: string[] };
  teams: { items: FavoriteEntity[]; favoriteIds: string[] };
  circuits: { items: FavoriteEntity[]; favoriteIds: string[] };
}) {
  const [tab, setTab] = useState<Tab>("players");
  const data = { players, teams, circuits }[tab];
  const type = TABS.find((t) => t.key === tab)!.type;

  return (
    <div>
      <div className="flex gap-2">
        {TABS.map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => setTab(t.key)}
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
      <div className="mt-4">
        <FavoriteEntityList type={type} items={data.items} favoriteIds={data.favoriteIds} />
      </div>
    </div>
  );
}
