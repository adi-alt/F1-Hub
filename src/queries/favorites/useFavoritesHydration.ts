"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { favoritesKeys } from "./favoritesKeys";
import type { FavoriteIds } from "./favorites.client";

// A `= []` default parameter evaluates a *new* array literal on every call where the argument is
// omitted - not a single stable value the way a default primitive is. Since the check below is a
// reference-equality comparison (`!==`), that fresh array never equals what's already in state,
// so a caller that omits trackIds set state on every single render, unconditionally - a real,
// deterministic infinite render loop, not a hypothetical one (confirmed live: "Too many
// re-renders" thrown from any page that calls FavoritesHydrator without a trackIds prop, e.g.
// /season, /archive?year=). One shared module-level reference fixes it at the source.
const EMPTY_IDS: string[] = [];

/** The actual seeding logic behind FavoritesHydrator, pulled out as its own hook so a client
 * component that reads favorites *and* already has the server-fetched ids as its own props
 * (ArchiveExplorer) can call this directly, before its own useFavoritesQuery()-backed selector
 * reads — rendering `<FavoritesHydrator>` as a JSX child seeds the cache too late for a component
 * that reads favorites earlier in its own render body than where that child appears.
 * `FavoritesHydrator` itself is just a thin JSX wrapper around this, for Server Component callers
 * (season/page.tsx) that can't call a hook directly. */
export function useFavoritesHydration(uid: string, driverIds: string[], teamIds: string[], trackIds: string[] = EMPTY_IDS): void {
  const queryClient = useQueryClient();
  const [prev, setPrev] = useState({ uid, driverIds, teamIds, trackIds });
  if (prev.uid !== uid || prev.driverIds !== driverIds || prev.teamIds !== teamIds || prev.trackIds !== trackIds) {
    setPrev({ uid, driverIds, teamIds, trackIds });
    const ids: FavoriteIds = { drivers: driverIds, teams: teamIds, tracks: trackIds };
    queryClient.setQueryData(favoritesKeys.all(), ids);
  }
}
