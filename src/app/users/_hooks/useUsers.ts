import { useEffect, useState } from "react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserProfile } from "@/lib/supabase/users";
import { usersKeys } from "../_queries/usersKeys";
import { fetchUsersPage, postRoleUpdate, searchUsers } from "../_service/users.client";

/** Mirrors MIN_SEARCH_LENGTH in users.service.ts — below this the server declines to search at
 * all and returns a normal first page, so firing the request would be pure waste. */
export const MIN_SEARCH_LENGTH = 2;

/** Cursor-paginated user list, seeded from the Server Component's initial page so the first
 * render needs no client fetch at all. staleTime: Infinity — AppRealtimeSync's admin `profiles`
 * listener is the actual freshness signal now (a profiles change invalidates this directly), so
 * there's no reason for this to also refetch on its own timers/on window focus. */
export function useUsersList(initialUsers: UserProfile[], initialCursor: string | null) {
  return useInfiniteQuery({
    queryKey: usersKeys.list(),
    queryFn: ({ pageParam }) => fetchUsersPage(pageParam),
    initialPageParam: initialCursor,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialData: { pages: [{ users: initialUsers, nextCursor: initialCursor }], pageParams: [initialCursor] },
    staleTime: Infinity,
  });
}

/** Holds a value back until it has stopped changing for `delayMs`. Search now hits the database
 * with a full-scan `ilike` rather than an indexed exact-match, so firing one per keystroke is a
 * real cost — this turns a typed word into one query instead of eight. */
export function useDebounced<T>(value: T, delayMs = 300): T {
  const [settled, setSettled] = useState(value);
  useEffect(() => {
    const timer = setTimeout(() => setSettled(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);
  return settled;
}

/** The server-side half of search, and deliberately only half: UserManagement filters the pages
 * it already holds on every keystroke (instant, no network), and only enables this when that
 * local filter comes up empty — the case where the match may exist but simply hasn't been paged
 * in yet. staleTime: Infinity for the same reason as useUsersList. */
export function useUserSearch(term: string, enabled: boolean) {
  return useQuery({
    queryKey: usersKeys.search(term),
    queryFn: () => searchUsers(term),
    enabled: enabled && term.trim().length >= MIN_SEARCH_LENGTH,
    staleTime: Infinity,
  });
}

export function useSetUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ uid, role }: { uid: string; role: "admin" | "moderator" | null }) => postRoleUpdate(uid, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: usersKeys.list() });
      void queryClient.invalidateQueries({ queryKey: usersKeys.searchAll() });
    },
  });
}
