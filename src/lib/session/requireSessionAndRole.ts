import { getSession } from "@/lib/session/getSession";
import { getUserRole } from "@/lib/session/getUserRole";
import type { Role } from "@/lib/rbac";

export type SessionAuth = { status: "signed-out" } | { status: "authorized"; uid: string; role: Role };

/** The one place every admin-area page checks "who is this and what can they do" — a fresh
 * Firestore role read every time (see getUserRole), never a cached value, so a demotion takes
 * effect on the very next page load. */
export async function requireSessionAndRole(): Promise<SessionAuth> {
  const session = await getSession();
  if (!session.uid) return { status: "signed-out" };
  const role = await getUserRole(session.uid);
  return { status: "authorized", uid: session.uid, role };
}
