import { NextResponse } from "next/server";
import { createGroup } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { name } = (await request.json().catch(() => ({}))) as { name?: string };
  if (typeof name !== "string") return NextResponse.json({ error: "Missing name" }, { status: 400 });

  try {
    const group = await createGroup(session.uid, name);
    return NextResponse.json(group);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
