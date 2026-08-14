import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { updateUserRole } from "@/app/users/services/users.service";
import { ServiceError } from "@/services/errors";

export async function POST(request: Request, { params }: { params: Promise<{ uid: string }> }) {
  const session = await getSession();
  const { uid } = await params;
  const { role: newRole } = (await request.json()) as { role: "admin" | "moderator" | null };
  if (newRole !== "admin" && newRole !== "moderator" && newRole !== null) {
    return NextResponse.json({ error: "Invalid role" }, { status: 400 });
  }

  try {
    await updateUserRole(session.uid, uid, newRole);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
