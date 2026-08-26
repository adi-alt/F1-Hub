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
