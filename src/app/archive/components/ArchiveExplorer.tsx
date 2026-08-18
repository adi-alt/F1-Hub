"use client";

import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { ArchiveCircuitGrid } from "./ArchiveCircuitGrid";
import { ArchiveDriverTable } from "./ArchiveDriverTable";
import { ArchiveSeasonGrid } from "./ArchiveSeasonGrid";
import { ArchiveTeamTable } from "./ArchiveTeamTable";
import type { ArchiveCircuit, ArchiveDriver, ArchiveTeam } from "@/lib/firestore/archive";

type Facet = "year" | "track" | "driver" | "team";
type FavoriteType = "track" | "driver" | "team";

const TABS: { key: Facet; label: string }[] = [
  { key: "year", label: "By year" },
  { key: "track", label: "By track" },
  { key: "driver", label: "By driver" },
  { key: "team", label: "By team" },
];

const PLACEHOLDER: Record<Facet, string> = {
  year: "Search years…",
  track: "Search tracks…",
  driver: "Search drivers…",
  team: "Search teams…",
};

/** Owns tab + search + favorites state client-side so switching facets is instant (no
 * navigation/refetch — all four datasets are already small enough to have been fetched once by
 * the server) and a favorite toggle survives leaving and returning to a tab. The `by=` URL param
 * still picks the *initial* tab (deep links from archiveCircuitHref/history pages' "← Archive"
 * links keep working), it just isn't kept in sync on every client-side tab click — ponytail: that
 * would need shallow-routing plumbing this page doesn't otherwise need. */
export function ArchiveExplorer({
  initialBy,
  years,
  circuits,
  drivers,
  teams,
  favoriteTracks: initialFavoriteTracks,
  favoriteDrivers: initialFavoriteDrivers,
  favoriteTeams: initialFavoriteTeams,
}: {
  initialBy: Facet;
  years: number[];
  circuits: ArchiveCircuit[];
  drivers: ArchiveDriver[];
  teams: ArchiveTeam[];
  favoriteTracks: string[];
  favoriteDrivers: string[];
  favoriteTeams: string[];
}) {
  const [by, setBy] = useState<Facet>(initialBy);
  const [search, setSearch] = useState("");
  const [favoriteTracks, setFavoriteTracks] = useState(() => new Set(initialFavoriteTracks));
  const [favoriteDrivers, setFavoriteDrivers] = useState(() => new Set(initialFavoriteDrivers));
  const [favoriteTeams, setFavoriteTeams] = useState(() => new Set(initialFavoriteTeams));

  function toggleFavorite(type: FavoriteType, id: string) {
    const [current, setCurrent] =
      type === "track" ? [favoriteTracks, setFavoriteTracks] : type === "team" ? [favoriteTeams, setFavoriteTeams] : [favoriteDrivers, setFavoriteDrivers];
    const willFavorite = !current.has(id);
    setCurrent((prev) => {
      const next = new Set(prev);
      if (willFavorite) next.add(id);
      else next.delete(id);
      return next;
    });
    fetch("/api/archive/favorites", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, id, favorited: willFavorite }),
    }).catch(() => {
      // Revert the optimistic update if the write didn't actually land.
      setCurrent((prev) => {
        const reverted = new Set(prev);
        if (willFavorite) reverted.delete(id);
        else reverted.add(id);
        return reverted;
      });
    });
  }

  function switchTo(next: Facet) {
    setBy(next);
    setSearch("");
  }

  const filteredYears = search ? years.filter((y) => String(y).includes(search.trim())) : years;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => switchTo(t.key)}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                t.key === by
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
          placeholder={PLACEHOLDER[by]}
          className="w-full max-w-xs rounded-full border border-[var(--f1-line)] bg-black/20 px-4 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-white/40 focus:outline-none"
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={by}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="mt-4 min-h-0 flex-1 overflow-hidden"
        >
          {by === "year" &&
            (filteredYears.length === 0 ? (
              <p className="text-sm text-neutral-500">No years match &ldquo;{search}&rdquo;.</p>
            ) : (
              <div className="h-full overflow-y-auto">
                <ArchiveSeasonGrid years={filteredYears} />
              </div>
            ))}
          {by === "track" && (
            <div className="h-full overflow-y-auto">
              <ArchiveCircuitGrid
                circuits={circuits}
                search={search}
                favoriteIds={favoriteTracks}
                onToggleFavorite={(id) => toggleFavorite("track", id)}
              />
            </div>
          )}
          {by === "driver" && (
            <ArchiveDriverTable
              drivers={drivers}
              search={search}
              favoriteIds={favoriteDrivers}
              onToggleFavorite={(id) => toggleFavorite("driver", id)}
            />
          )}
          {by === "team" && (
            <ArchiveTeamTable
              teams={teams}
              search={search}
              favoriteIds={favoriteTeams}
              onToggleFavorite={(id) => toggleFavorite("team", id)}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
