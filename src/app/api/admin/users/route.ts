import { NextResponse } from "next/server";
import { getUserByEmail, listUsersPage } from "@/lib/firestore/users";
import { permissionsForRole } from "@/lib/rbac";
import { getSession } from "@/lib/session/getSession";
import { getUserRole } from "@/lib/session/getUserRole";

export async function GET(request: Request) {
  const session = await getSession();
  const role = await getUserRole(session.uid);
  if (!permissionsForRole(role).canViewUsers) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { searchParams } = new URL(request.url);
  const email = searchParams.get("email");
  if (email) {
    const user = await getUserByEmail(email);
    return NextResponse.json({ users: user ? [user] : [] });
  }

  const cursor = searchParams.get("cursor");
  const { users, nextCursor } = await listUsersPage(cursor);
  return NextResponse.json({ users, nextCursor });
}
