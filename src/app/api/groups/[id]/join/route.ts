import { NextResponse } from "next/server";
import { joinGroup } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;

  try {
    const group = await joinGroup(session.uid, id);
    return NextResponse.json(group);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
