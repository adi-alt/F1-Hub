import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/lib/supabase/client";
import { usersKeys } from "../_queries/usersKeys";

/**
 * Subscribes to the `profiles` table and invalidates the users list/search caches on any change
 * (a role update, a new signup) so UserManagement re-fetches and re-renders on its own — same
 * postgres_changes -> react pattern every other *RealtimeWatcher in this app uses
 * (RaceRealtimeWatcher, GroupRealtimeWatcher, FavoritesRealtimeWatcher), just pushed straight into
 * the TanStack Query cache via invalidateQueries (which triggers an automatic background refetch
 * for every mounted query using that key) instead of router.refresh(), since this page's data is
 * TanStack-Query-cached, not server-props-seeded like races/groups/season.
 *
 * Requires the "admin read all profiles" RLS policy (see supabase/schema.sql) — without it, RLS
 * restricts a signed-in user's realtime subscription to their own profiles row (same as
 * FavoritesRealtimeWatcher's own filter), so an admin here would only ever see their own profile
 * change, not other users'. Degrades gracefully either way: this still correctly resyncs on the
 * admin's own row without that policy, it just won't see other admins/users' changes until it's
 * applied.
 *
 * Pairs with useUsersList/useUserSearch now using staleTime: Infinity (see _hooks/useUsers.ts) —
 * with a realtime listener as the actual freshness signal, there's no reason for TanStack Query to
 * also poll/refetch on its own timers.
 */
export function useUsersRealtimeSync() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const channel = supabase
      .channel("users-realtime-sync")
      .on("postgres_changes", { event: "*", schema: "public", table: "profiles" }, () => {
        void queryClient.invalidateQueries({ queryKey: usersKeys.list() });
        void queryClient.invalidateQueries({ queryKey: usersKeys.searchAll() });
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);
}
