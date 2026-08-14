import { getUserByEmail, listUsersPage, setUserRole, type UserProfile } from "@/lib/firestore/users";
import type { Role } from "@/lib/rbac";
import { requirePermission } from "@/lib/session/requirePermission";

export async function listUsers(
  requesterUid: string | null | undefined,
  cursor: string | null,
  email?: string | null,
) {
  const permissions = await requirePermission(requesterUid, (p) => p.canViewUsers);
  if (email) {
    const user = await getUserByEmail(email);
    return { users: user ? [user] : [], nextCursor: null as string | null, permissions };
  }
  const { users, nextCursor } = await listUsersPage(cursor);
  return { users, nextCursor, permissions };
}

// Deliberately doesn't block removing your *own* admin role via this call; the UI
// (UserManagement.tsx) hides that button so it's not a one-click accident, but the service itself
// has no reason to special-case it.
export async function updateUserRole(
  requesterUid: string | null | undefined,
  targetUid: string,
  role: Exclude<Role, "user"> | null,
): Promise<void> {
  await requirePermission(requesterUid, (p) => p.canManageRoles);
  await setUserRole(targetUid, role);
}

export type { UserProfile };
