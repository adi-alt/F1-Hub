"use client";

import { useFavoritesHydration } from "@/queries/favorites/useFavoritesHydration";

// Same reference-equality footgun useFavoritesHydration's own default guards against - a fresh
// `[]` literal default here would still reach that hook as an explicit (not omitted) argument on
// every render, so its own EMPTY_IDS default wouldn't cover this call path. One stable reference,
// not two independently.
const EMPTY_IDS: string[] = [];

/** Mounted once by a Server Component page that already server-fetched this user's favorites
 * (season) — a thin JSX wrapper around useFavoritesHydration for the case where the caller can't
 * call a hook directly. A client component that reads favorites itself (ArchiveExplorer) should
 * call that hook directly instead, before its own useFavoritesQuery()-backed reads — see that
 * hook's docstring for why the ordering matters. */
export function FavoritesHydrator({
  uid,
  driverIds,
  teamIds,
  trackIds = EMPTY_IDS,
}: {
  uid: string;
  driverIds: string[];
  teamIds: string[];
  trackIds?: string[];
}) {
  useFavoritesHydration(uid, driverIds, teamIds, trackIds);
  return null;
}
