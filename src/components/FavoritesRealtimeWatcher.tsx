"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { supabase } from "@/lib/supabase/client";

/**
 * Same idea as RaceRealtimeWatcher/GroupRealtimeWatcher: renders nothing, refreshes the page the
 * moment this user's own `profiles` row changes (favorite_drivers/favorite_teams/favorite_tracks
 * are plain array columns on it, see setArchiveFavorite) - not needed for a toggle made *on this
 * page* (useFavoritesStore already updates that instantly, optimistically, no refresh), but this
 * is what closes the gap for a favorite changed somewhere else: another tab, another device, or a
 * page other than the one currently mounted, none of which the shared store would otherwise ever
 * see. A refresh re-passes fresh server props into whichever FavoritesHydrator is mounted on the
 * page, which resyncs the store. getUserProfile isn't wrapped in unstable_cache and the page
 * already reads cookies() (forces dynamic rendering), so a plain refresh is enough - no separate
 * cache-tag busting needed.
 */
export function FavoritesRealtimeWatcher({ uid }: { uid: string }) {
  const router = useRouter();

  useEffect(() => {
    const channel = supabase
      .channel(`profile-favorites-${uid}`)
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${uid}` }, () => router.refresh())
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [uid, router]);

  return null;
}
