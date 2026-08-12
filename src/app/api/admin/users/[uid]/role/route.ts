import { NextResponse } from "next/server";
import { setUserRole } from "@/lib/firestore/users";
import { getSession } from "@/lib/session/getSession";
import { isAdmin } from "@/lib/session/isAdmin";

// A mutating, privilege-granting action — re-checks isAdmin server-side, same discipline as
// /api/admin/trigger. Deliberately doesn't block removing your *own* admin role via this API;
// the UI (UserManagement.tsx) hides that button so it's not a one-click accident, but the route
// itself has no reason to special-case it.
export async function POST(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const session = await getSession();
  if (!(await isAdmin(session.uid))) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { uid } = await params;
  const { role } = (await request.json()) as { role: "admin" | null };
  if (role !== "admin" && role !== null) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  await setUserRole(uid, role);
  return NextResponse.json({ ok: true });
}
