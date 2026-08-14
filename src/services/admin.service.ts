import { listRecentRuns, triggerWorkflow, type WorkflowRun } from "@/lib/github";
import { getModelBenchmarks, type ModelBenchmark } from "@/lib/firestore/admin";
import { getUserByEmail, listUsersPage, setUserRole, type UserProfile } from "@/lib/firestore/users";
import { permissionsForRole, type Permissions, type Role } from "@/lib/rbac";
import { getUserRole } from "@/lib/session/getUserRole";
import { ServiceError } from "./errors";

const PIPELINE_WORKFLOWS = ["fetch-races.yml", "sync-calendar.yml"] as const;

/** Every admin action starts with the same "who is this and what can they do" check — a fresh
 * Firestore role read every time (see getUserRole), never a cached value, so a demotion takes
 * effect on the very next call. Centralized here so route handlers and Server Components get the
 * same enforcement for free instead of repeating the getUserRole/permissionsForRole pair that
 * used to be copy-pasted into every admin route. */
async function requirePermission(
  requesterUid: string | null | undefined,
  check: (p: Permissions) => boolean,
): Promise<Permissions> {
  const role = await getUserRole(requesterUid);
  const permissions = permissionsForRole(role);
  if (!check(permissions)) throw new ServiceError("Forbidden", 403);
  return permissions;
}

export async function listUsers(
  requesterUid: string | null | undefined,
  cursor: string | null,
  email?: string | null,
): Promise<{ users: UserProfile[]; nextCursor: string | null; permissions: Permissions }> {
  const permissions = await requirePermission(requesterUid, (p) => p.canViewUsers);
  if (email) {
    const user = await getUserByEmail(email);
    return { users: user ? [user] : [], nextCursor: null, permissions };
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

export async function listPipelineRuns(
  requesterUid: string | null | undefined,
): Promise<{ workflow: string; runs: WorkflowRun[] }[]> {
  await requirePermission(requesterUid, (p) => p.canAccessAdmin);
  return Promise.all(
    PIPELINE_WORKFLOWS.map(async (workflow) => ({ workflow, runs: await listRecentRuns(workflow) })),
  );
}

// A mutating, admin-only action (moderators can view runs but not trigger them).
export async function triggerPipelineRun(requesterUid: string | null | undefined, workflow: string): Promise<void> {
  await requirePermission(requesterUid, (p) => p.canTriggerPipelineRuns);
  if (!PIPELINE_WORKFLOWS.includes(workflow as (typeof PIPELINE_WORKFLOWS)[number])) {
    throw new ServiceError("Unknown workflow", 400);
  }
  await triggerWorkflow(workflow);
}

export async function getBenchmarks(requesterUid: string | null | undefined): Promise<ModelBenchmark[]> {
  await requirePermission(requesterUid, (p) => p.canAccessAdmin);
  return getModelBenchmarks();
}
