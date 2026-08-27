"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useNestedLenisScroll } from "@/components/motion/useLenisContainer";
import { useFavDriverIds, useFavTeamIds, useFavTrackIds, useToggleFavorite } from "@/queries/favorites/useFavorites";
import { useFavoritesHydration } from "@/queries/favorites/useFavoritesHydration";
import { ArchiveCircuitGrid } from "./ArchiveCircuitGrid";
import { ArchiveDriverTable } from "./ArchiveDriverTable";
import { ArchiveSeasonGrid } from "./ArchiveSeasonGrid";
import { ArchiveTeamTable } from "./ArchiveTeamTable";
import type { ArchiveCircuit, ArchiveDriver, ArchiveTeam } from "@/lib/supabase/archive";

type Facet = "year" | "track" | "driver" | "team";

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
 * the server) and a favorite toggle survives leaving and returning to a tab. The active facet is
 * also reflected in the URL (/archive?section=...) via router.replace, same switch-instantly-
 * then-sync pattern as personalization's own tabs — switching tabs also drops any `page` param,
 * since a page number from the previous facet's table doesn't mean anything for the new one. */
export function ArchiveExplorer({
  uid,
  initialSection,
  years,
  circuits,
  drivers,
  teams,
  favoriteTracks: initialFavoriteTracks,
  favoriteDrivers: initialFavoriteDrivers,
  favoriteTeams: initialFavoriteTeams,
}: {
  uid: string;
  initialSection: Facet;
  years: number[];
  circuits: ArchiveCircuit[];
  drivers: ArchiveDriver[];
  teams: ArchiveTeam[];
  favoriteTracks: string[];
  favoriteDrivers: string[];
  favoriteTeams: string[];
}) {
  const router = useRouter();
  const [section, setSection] = useState<Facet>(initialSection);
  const [search, setSearch] = useState("");
  // Shared with the season page — favoriting a driver/team here now reflects there immediately
  // (and vice versa), both backed by the same favoritesKeys.all() query cache entry instead of
  // two independent optimistic-Set implementations that never knew about each other. See
  // src/queries/favorites/useFavorites.ts. Hydrated directly (not via <FavoritesHydrator>) since
  // that seeding has to happen before the useFav*Ids() reads immediately below, not in a JSX
  // child rendered after them.
  useFavoritesHydration(uid, initialFavoriteDrivers, initialFavoriteTeams, initialFavoriteTracks);
  const favoriteTracks = useFavTrackIds();
  const favoriteDrivers = useFavDriverIds();
  const favoriteTeams = useFavTeamIds();
  const toggleFavorite = useToggleFavorite();
  // Year/track are the only two facets with their own inner scroll region (driver/team tables
  // scroll the page itself) - one nested-region registration covers both since only one of them
  // is ever mounted at a time. Without this, scrolling either grid also drags the whole page's
  // own Lenis scroll along with it.
  const scrollRef = useNestedLenisScroll(section);

  function switchTo(next: Facet) {
    setSection(next);
    setSearch("");
    router.replace(`/archive?section=${next}`, { scroll: false });
  }

  const filteredYears = search ? years.filter((y) => String(y).includes(search.trim())) : years;

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap gap-1 rounded-full border border-[var(--f1-line)] bg-black/20 p-1">
          {TABS.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => switchTo(t.key)}
              className="relative rounded-full px-4 py-1.5 text-sm font-medium transition"
            >
              {t.key === section && (
                <motion.div
                  layoutId="archive-tab-capsule"
                  className="absolute inset-0 rounded-full bg-[var(--f1-red)]"
                  transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
                />
              )}
              <span className={`relative z-10 ${t.key === section ? "text-white" : "text-neutral-300 hover:text-white"}`}>
                {t.label}
              </span>
            </button>
          ))}
        </div>
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={PLACEHOLDER[section]}
          className="w-full max-w-xs rounded-full border border-[var(--f1-line)] bg-black/20 px-4 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-white/40 focus:outline-none"
        />
      </div>

      <AnimatePresence mode="wait">
        <motion.div
          key={section}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="mt-4 min-h-0 flex-1 overflow-hidden"
        >
          {section === "year" &&
            (filteredYears.length === 0 ? (
              <p className="text-sm text-neutral-500">No years match &ldquo;{search}&rdquo;.</p>
            ) : (
              <div ref={scrollRef} className="h-full overflow-y-auto scrollbar-hide">
                <ArchiveSeasonGrid years={filteredYears} />
              </div>
            ))}
          {section === "track" && (
            <div ref={scrollRef} className="h-full overflow-y-auto scrollbar-hide">
              <ArchiveCircuitGrid
                circuits={circuits}
                search={search}
                favoriteIds={favoriteTracks}
                onToggleFavorite={(id) => toggleFavorite("track", id)}
              />
            </div>
          )}
          {section === "driver" && (
            <ArchiveDriverTable
              drivers={drivers}
              search={search}
              favoriteIds={favoriteDrivers}
              onToggleFavorite={(id) => toggleFavorite("driver", id)}
            />
          )}
          {section === "team" && (
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
