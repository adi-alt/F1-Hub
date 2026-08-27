"use client";

import { createContext, useContext, useState, type ReactNode } from "react";
import { postFavorite } from "@/lib/favorites";

type SeasonFavoritesState = {
  favDrivers: Set<string>;
  favTeams: Set<string>;
  toggleDriver: (id: string) => void;
  toggleTeam: (id: string) => void;
};

const SeasonFavoritesContext = createContext<SeasonFavoritesState | null>(null);

// One shared source of truth for the whole season page — the table and the sidebar widgets are
// siblings, not parent/child, so before this each owned its own local useState and toggling a
// favorite in one never touched the other's copy (the actual bug: "not reactive... need to
// refresh"). Every favorite control on this page now reads/writes through this instead of its
// own state, so a toggle anywhere is visible everywhere immediately.
export function SeasonFavoritesProvider({
  initialDriverIds,
  initialTeamIds,
  children,
}: {
  initialDriverIds: string[];
  initialTeamIds: string[];
  children: ReactNode;
}) {
  const [favDrivers, setFavDrivers] = useState(() => new Set(initialDriverIds));
  const [favTeams, setFavTeams] = useState(() => new Set(initialTeamIds));

  // FavoritesRealtimeWatcher calls router.refresh() when this profile's favorites change
  // somewhere else (another tab/device, or the Archive/Profile pages) - that re-runs the server
  // component and passes fresh initial*Ids props in, but doesn't remount this provider, so the
  // lazy useState initializers above never see them again on their own. Same "adjust state during
  // render when a prop changes" pattern ProgressionPanel already uses for its own stale-selection
  // reset, rather than an effect (which would mean an extra, avoidable render pass here). A toggle
  // made right here on this page never hits this at all - it's already reflected optimistically,
  // and the props driving this comparison only change on an actual server refresh.
  const [prevInitialDriverIds, setPrevInitialDriverIds] = useState(initialDriverIds);
  if (prevInitialDriverIds !== initialDriverIds) {
    setPrevInitialDriverIds(initialDriverIds);
    setFavDrivers(new Set(initialDriverIds));
  }
  const [prevInitialTeamIds, setPrevInitialTeamIds] = useState(initialTeamIds);
  if (prevInitialTeamIds !== initialTeamIds) {
    setPrevInitialTeamIds(initialTeamIds);
    setFavTeams(new Set(initialTeamIds));
  }

  function toggleDriver(id: string) {
    const willFavorite = !favDrivers.has(id);
    setFavDrivers((prev) => {
      const next = new Set(prev);
      if (willFavorite) next.add(id);
      else next.delete(id);
      return next;
    });
    postFavorite("driver", id, willFavorite).catch(() => {
      setFavDrivers((prev) => {
        const reverted = new Set(prev);
        if (willFavorite) reverted.delete(id);
        else reverted.add(id);
        return reverted;
      });
    });
  }

  function toggleTeam(id: string) {
    const willFavorite = !favTeams.has(id);
    setFavTeams((prev) => {
      const next = new Set(prev);
      if (willFavorite) next.add(id);
      else next.delete(id);
      return next;
    });
    postFavorite("team", id, willFavorite).catch(() => {
      setFavTeams((prev) => {
        const reverted = new Set(prev);
        if (willFavorite) reverted.delete(id);
        else reverted.add(id);
        return reverted;
      });
    });
  }

  return (
    <SeasonFavoritesContext.Provider value={{ favDrivers, favTeams, toggleDriver, toggleTeam }}>{children}</SeasonFavoritesContext.Provider>
  );
}

export function useSeasonFavorites(): SeasonFavoritesState {
  const ctx = useContext(SeasonFavoritesContext);
  if (!ctx) throw new Error("useSeasonFavorites must be used within a SeasonFavoritesProvider");
  return ctx;
}
