import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserProfile } from "@/lib/supabase/users";
import { usersKeys } from "../_queries/usersKeys";
import { fetchUsersByEmail, fetchUsersPage, postRoleUpdate } from "../_service/users.client";

/** Cursor-paginated user list, seeded from the Server Component's initial page so the first
 * render needs no client fetch at all. */
export function useUsersList(initialUsers: UserProfile[], initialCursor: string | null) {
  return useInfiniteQuery({
    queryKey: usersKeys.list(),
    queryFn: ({ pageParam }) => fetchUsersPage(pageParam),
    initialPageParam: initialCursor,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialData: { pages: [{ users: initialUsers, nextCursor: initialCursor }], pageParams: [initialCursor] },
  });
}

/** Exact-email search box — fires on every change (no debounce; email search wasn't something
 * asked to change), only enabled once there's something to search for. */
export function useUserSearch(email: string) {
  return useQuery({
    queryKey: usersKeys.search(email),
    queryFn: () => fetchUsersByEmail(email),
    enabled: email.trim().length > 0,
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
