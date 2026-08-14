import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { listUsers } from "@/users/services/users.service";
import { ServiceError } from "@/services/errors";

export async function GET(request: Request) {
  const session = await getSession();
  const { searchParams } = new URL(request.url);

  try {
    const { users, nextCursor } = await listUsers(session.uid, searchParams.get("cursor"), searchParams.get("email"));
    return NextResponse.json({ users, nextCursor });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
