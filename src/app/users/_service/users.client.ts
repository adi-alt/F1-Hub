import type { UserProfile } from "@/lib/supabase/users";

export type UsersPage = { users: UserProfile[]; nextCursor: string | null };

export async function fetchUsersPage(cursor: string | null): Promise<UsersPage> {
  const url = cursor ? `/api/users?cursor=${encodeURIComponent(cursor)}` : "/api/users";
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status}`);
  return res.json();
}

export async function fetchUsersByEmail(email: string): Promise<UserProfile[]> {
  const res = await fetch(`/api/users?email=${encodeURIComponent(email)}`);
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
