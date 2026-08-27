"use client";

import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "framer-motion";
import { QuietTabs } from "@/app/season/_components/QuietTabs";
import { useNestedLenisScroll } from "@/components/motion/useLenisContainer";
import { useUrlParam } from "@/hooks/useUrlParam";
import { eraForYear } from "@/lib/eras";
import { useFavDriverIds, useFavTeamIds, useFavTrackIds, useToggleFavorite } from "@/queries/favorites/useFavorites";
import { useFavoritesHydration } from "@/queries/favorites/useFavoritesHydration";
import { ArchiveCircuitGrid } from "./ArchiveCircuitGrid";
import { ArchiveDriverTable } from "./ArchiveDriverTable";
import { EraFilterSelect, FavoritesOnlyToggle, TrackFilters } from "./ArchiveFilters";
import { ArchiveSeasonGrid } from "./ArchiveSeasonGrid";
import { ArchiveTeamTable } from "./ArchiveTeamTable";
import type { ArchiveCircuit, ArchiveDriver, ArchiveTeam } from "@/lib/supabase/archive";

type Facet = "year" | "track" | "driver" | "team";

const TABS: { value: Facet; label: string }[] = [
  { value: "year", label: "By year" },
  { value: "track", label: "By track" },
  { value: "driver", label: "By driver" },
  { value: "team", label: "By team" },
];

const PLACEHOLDER: Record<Facet, string> = {
  year: "Search years…",
  track: "Search tracks…",
  driver: "Search drivers…",
  team: "Search teams…",
};

/** Owns tab + search + filter + favorites state so switching facets is instant (no navigation/
 * refetch, all four datasets are already small enough to have been fetched once by the server)
 * and a favorite toggle survives leaving and returning to a tab. Section, search, and every filter
 * are URL-backed (useUrlParam/useUrlPage) so a refresh or a shared link preserves them - switching
 * facets explicitly resets the others, since an era filter or a track status filter doesn't mean
 * anything on a different facet's data. */
export function ArchiveExplorer({
  uid,
  initialSection,
  years,
  currentYear,
  circuits,
  drivers,
  teams,
  activeCircuitIds,
  activeTeamIds,
  favoriteTracks: initialFavoriteTracks,
  favoriteDrivers: initialFavoriteDrivers,
  favoriteTeams: initialFavoriteTeams,
}: {
  uid: string;
  initialSection: Facet;
  years: number[];
  currentYear: number;
  circuits: ArchiveCircuit[];
  drivers: ArchiveDriver[];
  teams: ArchiveTeam[];
  /** Circuit/team ids that resolve to the current season's roster - see archive/page.tsx for how
   * these are derived (reusing resolveCurrentCircuitToArchiveId/archiveSlugForCurrentTeam, not new
   * matching logic). */
  activeCircuitIds: string[];
  activeTeamIds: string[];
  favoriteTracks: string[];
  favoriteDrivers: string[];
  favoriteTeams: string[];
}) {
  const router = useRouter();
  const [section, setSectionState] = useUrlParam("section", initialSection);
  const [search, setSearch] = useUrlParam("q");
  const [era, setEra] = useUrlParam("era", "all");
  const [status, setStatus] = useUrlParam("status", "all");
  const [country, setCountry] = useUrlParam("country");
  const [favParam, setFavParam] = useUrlParam("fav");
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
  const scrollRef = useNestedLenisScroll(`${section}-${era}-${status}-${country}-${favParam}`);

  const activeCircuitIdSet = new Set(activeCircuitIds);
  const activeTeamIdSet = new Set(activeTeamIds);
  const favoritesOnly = favParam === "1";
  // useUrlParam hands back a plain string (a hand-edited URL could put anything in ?section=) -
  // this is the one place that gets validated back into the real Facet union; everything below
  // reads `section` (via useUrlParam) expecting it, `facet` for indexing/rendering that needs the
  // narrowed type.
  const facet: Facet = TABS.some((t) => t.value === section) ? (section as Facet) : "year";
  const trackStatus: "all" | "active" | "historical" = status === "active" || status === "historical" ? status : "all";

  function switchTo(next: Facet) {
    // Each setter below also calls router.replace on its own (see useUrlParam) - redundant with
    // the explicit replace at the end, but harmless: every call here is a client-side history
    // update with no network request, and the final explicit replace (a fresh, clean URL, not
    // derived from the others' stale searchParams snapshots) is what actually wins in the address
    // bar. What has to happen here is each hook's own React state getting reset - that part isn't
    // optional, only the extra replace calls are.
    setSectionState(next);
    setSearch("");
    setEra("all");
    setStatus("all");
    setCountry("");
    setFavParam("");
    router.replace(`/archive?section=${next}`, { scroll: false });
  }

  const filteredYears = years.filter((y) => {
    if (era !== "all" && eraForYear(y).id !== era) return false;
    if (search && !String(y).includes(search.trim())) return false;
    return true;
  });
  const showLiveSeason = era === "all" && (!search.trim() || String(currentYear).includes(search.trim()));

  const countries = [...new Set(circuits.map((c) => c.country).filter((c): c is string => !!c))].sort();

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-3">
        <QuietTabs options={TABS} value={facet} onChange={switchTo} />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder={PLACEHOLDER[facet]}
          aria-label={PLACEHOLDER[facet]}
          className="w-full max-w-xs rounded-full border border-[var(--f1-line)] bg-black/20 px-4 py-1.5 text-sm text-white placeholder:text-neutral-500 focus:border-white/40 focus:outline-none"
        />
      </div>

      {facet === "year" && (
        <div className="mt-3 shrink-0">
          <EraFilterSelect value={era} onChange={setEra} />
        </div>
      )}
      {facet === "track" && (
        <div className="mt-3 shrink-0">
          <TrackFilters
            status={trackStatus}
            onStatusChange={(v) => setStatus(v)}
            country={country}
            onCountryChange={setCountry}
            countries={countries}
            favoritesOnly={favoritesOnly}
            onFavoritesOnlyChange={(v) => setFavParam(v ? "1" : "")}
          />
        </div>
      )}
      {(facet === "driver" || facet === "team") && (
        <div className="mt-3 shrink-0">
          <FavoritesOnlyToggle value={favoritesOnly} onChange={(v) => setFavParam(v ? "1" : "")} />
        </div>
      )}

      <AnimatePresence mode="wait">
        <motion.div
          key={facet}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.2, ease: "easeOut" }}
          className="mt-4 min-h-0 flex-1 overflow-hidden"
        >
          {facet === "year" && (
            <div ref={scrollRef} className="h-full overflow-y-auto scrollbar-hide">
              {filteredYears.length === 0 && !showLiveSeason ? (
                <p className="text-sm text-neutral-500">No years match &ldquo;{search}&rdquo;.</p>
              ) : (
                <ArchiveSeasonGrid years={filteredYears} currentYear={currentYear} showLiveSeason={showLiveSeason} />
              )}
            </div>
          )}
          {facet === "track" && (
            <div ref={scrollRef} className="h-full overflow-y-auto scrollbar-hide">
              <ArchiveCircuitGrid
                circuits={circuits}
                search={search}
                favoriteIds={favoriteTracks}
                onToggleFavorite={(id) => toggleFavorite("track", id)}
                activeCircuitIds={activeCircuitIdSet}
                status={trackStatus}
                country={country}
                favoritesOnly={favoritesOnly}
              />
            </div>
          )}
          {facet === "driver" && (
            <ArchiveDriverTable
              drivers={drivers}
              search={search}
              favoriteIds={favoriteDrivers}
              onToggleFavorite={(id) => toggleFavorite("driver", id)}
              favoritesOnly={favoritesOnly}
            />
          )}
          {facet === "team" && (
            <ArchiveTeamTable
              teams={teams}
              search={search}
              favoriteIds={favoriteTeams}
              onToggleFavorite={(id) => toggleFavorite("team", id)}
              favoritesOnly={favoritesOnly}
              activeTeamIds={activeTeamIdSet}
            />
          )}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}
