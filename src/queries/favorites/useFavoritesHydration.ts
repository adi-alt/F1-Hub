"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { favoritesKeys } from "./favoritesKeys";
import type { FavoriteIds } from "./favorites.client";

/** The actual seeding logic behind FavoritesHydrator, pulled out as its own hook so a client
 * component that reads favorites *and* already has the server-fetched ids as its own props
 * (ArchiveExplorer) can call this directly, before its own useFavoritesQuery()-backed selector
 * reads — rendering `<FavoritesHydrator>` as a JSX child seeds the cache too late for a component
 * that reads favorites earlier in its own render body than where that child appears.
 * `FavoritesHydrator` itself is just a thin JSX wrapper around this, for Server Component callers
 * (season/page.tsx) that can't call a hook directly. */
export function useFavoritesHydration(uid: string, driverIds: string[], teamIds: string[], trackIds: string[] = []): void {
  const queryClient = useQueryClient();
  const [prev, setPrev] = useState({ uid, driverIds, teamIds, trackIds });
  if (prev.uid !== uid || prev.driverIds !== driverIds || prev.teamIds !== teamIds || prev.trackIds !== trackIds) {
    setPrev({ uid, driverIds, teamIds, trackIds });
    const ids: FavoriteIds = { drivers: driverIds, teams: teamIds, tracks: trackIds };
    queryClient.setQueryData(favoritesKeys.all(), ids);
  }
}
