import type { UserProfile } from "@/lib/supabase/users";

export type UsersPage = { users: UserProfile[]; nextCursor: string | null };

export async function fetchUsersPage(cursor: string | null): Promise<UsersPage> {
  const url = cursor ? `/api/users?cursor=${encodeURIComponent(cursor)}` : "/api/users";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

/** Server-side substring search across email/display name/username/first name — the counterpart
 * to the client-side filter in UserManagement, used when the term matches nothing in the pages
 * already loaded and the answer might still be further down the table. */
export async function searchUsers(term: string): Promise<UserProfile[]> {
  const res = await fetch(`/api/users?q=${encodeURIComponent(term)}`);
  if (!res.ok) throw new Error(`${res.status}`);
  const body = (await res.json()) as UsersPage;
  return body.users;
}

export async function postRoleUpdate(uid: string, role: "admin" | "moderator" | null): Promise<void> {
  const res = await fetch(`/api/users/${uid}/role`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role }),
  });
  if (!res.ok) throw new Error(`${res.status}`);
}
