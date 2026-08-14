import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { UserProfile } from "@/lib/firestore/users";

type UsersPage = { users: UserProfile[]; nextCursor: string | null };

const USERS_KEY = ["admin-users"] as const;

async function fetchUsersPage(cursor: string | null): Promise<UsersPage> {
  const url = cursor ? `/api/admin/users?cursor=${encodeURIComponent(cursor)}` : "/api/admin/users";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/** Cursor-paginated user list, seeded from the Server Component's initial page so the first
 * render needs no client fetch at all — replaces UserManagement.tsx's hand-rolled cursor state
 * and "load more" fetch. */
export function useAdminUsersList(initialUsers: UserProfile[], initialCursor: string | null) {
  return useInfiniteQuery({
    queryKey: USERS_KEY,
    queryFn: ({ pageParam }) => fetchUsersPage(pageParam),
    initialPageParam: initialCursor,
    getNextPageParam: (lastPage) => lastPage.nextCursor,
    initialData: { pages: [{ users: initialUsers, nextCursor: initialCursor }], pageParams: [initialCursor] },
  });
}

async function fetchUsersByEmail(email: string): Promise<UserProfile[]> {
  const res = await fetch(`/api/admin/users?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const body = (await res.json()) as UsersPage;
  return body.users;
}

/** Exact-email search box — fires on every change like the original (no debounce here; email
 * search wasn't something asked to change), only enabled once there's something to search for. */
export function useAdminUserSearch(email: string) {
  return useQuery({
    queryKey: ["admin-users-search", email],
    queryFn: () => fetchUsersByEmail(email),
    enabled: email.trim().length > 0,
  });
}

async function postRoleUpdate(uid: string, role: "admin" | "moderator" | null): Promise<void> {
  const res = await fetch(`/api/admin/users/${uid}/role`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
}

export function useSetUserRole() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ uid, role }: { uid: string; role: "admin" | "moderator" | null }) => postRoleUpdate(uid, role),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: USERS_KEY });
      void queryClient.invalidateQueries({ queryKey: ["admin-users-search"] });
    },
  });
}
