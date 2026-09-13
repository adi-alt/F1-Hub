import { permissionsForRole, type Permissions } from "@/lib/rbac";
import { getUserRole } from "@/lib/session/getUserRole";
import { ServiceError } from "@/services/errors";

/** Every users/models action starts with the same "who is this and what can they do" check — a
 * fresh Firestore role read every time (see getUserRole), never a cached value, so a demotion
 * takes effect on the very next call. Shared here (rather than duplicated in users.service.ts and
 * models.service.ts) since both need it. */
export async function requirePermission(
  requesterUid: string | null | undefined,
  check: (p: Permissions) => boolean,
): Promise<Permissions> {
  const role = await getUserRole(requesterUid);
  const permissions = permissionsForRole(role);
  if (!check(permissions)) throw new ServiceError("Forbidden", 403);
  return permissions;
}
