import { countUsers, listUsersPage, searchUsers, setUserRole, type UserCounts, type UserProfile } from "@/lib/supabase/users";
import type { Role } from "@/lib/rbac";
import { requirePermission } from "@/lib/session/requirePermission";

/** The search box's minimum useful term. A single character matches most of the table via
 * `ilike '%a%'`, which is a full scan returning noise — not a result worth the query. */
export const MIN_SEARCH_LENGTH = 2;

export async function listUsers(
  requesterUid: string | null | undefined,
  cursor: string | null,
  search?: string | null,
) {
  const permissions = await requirePermission(requesterUid, (p) => p.canViewUsers);
  const term = search?.trim() ?? "";
  if (term.length >= MIN_SEARCH_LENGTH) {
    // A search is a whole result set, not a page of one — there's no cursor to hand back, and
    // searchUsers' own limit is the cap.
    return { users: await searchUsers(term), nextCursor: null as string | null, permissions };
  }
  const { users, nextCursor } = await listUsersPage(cursor);
  return { users, nextCursor, permissions };
}

/** Roster-wide totals for the page's stat tiles, behind the same canViewUsers gate as the list
 * itself — these are counts *of* the user table, so anyone who can't see the table can't see
 * them either. */
export async function getUserCounts(requesterUid: string | null | undefined): Promise<UserCounts> {
  await requirePermission(requesterUid, (p) => p.canViewUsers);
  return countUsers();
}

// Deliberately doesn't block removing your *own* admin role via this call; the UI
// (UserManagement.tsx) disables that control so it's not a one-click accident, but the service
// itself has no reason to special-case it.
export async function updateUserRole(
  requesterUid: string | null | undefined,
  targetUid: string,
  role: Exclude<Role, "user"> | null,
): Promise<void> {
  await requirePermission(requesterUid, (p) => p.canManageRoles);
  await setUserRole(targetUid, role);
}

export type { UserProfile, UserCounts };
