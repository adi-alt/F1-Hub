import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserProfile } from "@/lib/supabase/users";
import { usersKeys } from "../_queries/usersKeys";
import { fetchUsersByEmail, fetchUsersPage, postRoleUpdate } from "../_service/users.client";

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

/** Exact-email search box — fires on every change (no debounce; email search wasn't something
 * asked to change), only enabled once there's something to search for. Same staleTime: Infinity
 * reasoning as useUsersList above. */
export function useUserSearch(email: string) {
  return useQuery({
    queryKey: usersKeys.search(email),
    queryFn: () => fetchUsersByEmail(email),
    enabled: email.trim().length > 0,
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
