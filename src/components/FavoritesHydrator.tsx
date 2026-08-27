"use client";

import { useState } from "react";
import { useFavoritesStore } from "@/store/useFavoritesStore";

/** Mounted once by any page that already server-fetched this user's favorites (season, archive) —
 * seeds the shared store the moment this renders, and again whenever the incoming ids actually
 * change (e.g. FavoritesRealtimeWatcher's router.refresh() re-passing fresh server props in; a
 * toggle made on this page never reaches here, it's already reflected in the store optimistically
 * before any refresh could happen).
 *
 * Seeds synchronously during render (not in a useEffect) so there's no one-frame flash of "nothing
 * favorited" before the store catches up — same "compare against previous props, only act on a
 * real change" render-time-adjustment pattern already proven elsewhere in this app
 * (ProgressionPanel's prevEntityType), using useState rather than a ref since React disallows
 * reading ref.current during render (only the "initialize once" ref pattern is exempt). */
export function FavoritesHydrator({
  uid,
  driverIds,
  teamIds,
  trackIds = [],
}: {
  uid: string;
  driverIds: string[];
  teamIds: string[];
  trackIds?: string[];
}) {
  const [prev, setPrev] = useState({ uid, driverIds, teamIds, trackIds });
  if (prev.uid !== uid || prev.driverIds !== driverIds || prev.teamIds !== teamIds || prev.trackIds !== trackIds) {
    setPrev({ uid, driverIds, teamIds, trackIds });
    useFavoritesStore.getState().hydrate(uid, { drivers: driverIds, teams: teamIds, tracks: trackIds });
  }
  return null;
}
