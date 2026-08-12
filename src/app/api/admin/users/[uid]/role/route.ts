import { NextResponse } from "next/server";
import { setUserRole } from "@/lib/firestore/users";
import { permissionsForRole } from "@/lib/rbac";
import { getSession } from "@/lib/session/getSession";
import { getUserRole } from "@/lib/session/getUserRole";

// A mutating, privilege-granting action, admin-only (moderators cannot promote/demote anyone,
// including other moderators) — re-checks role server-side, same discipline as
// /api/admin/trigger. Deliberately doesn't block removing your *own* admin role via this API;
// the UI (UserManagement.tsx) hides that button so it's not a one-click accident, but the route
// itself has no reason to special-case it.
export async function POST(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const session = await getSession();
  const role = await getUserRole(session.uid);
  if (!permissionsForRole(role).canManageRoles) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { uid } = await params;
  const { role: newRole } = (await request.json()) as { role: "admin" | "moderator" | null };
  if (newRole !== "admin" && newRole !== "moderator" && newRole !== null) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  await setUserRole(uid, newRole);
  return NextResponse.json({ ok: true });
}
