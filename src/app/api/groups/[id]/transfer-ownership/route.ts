import { NextResponse } from "next/server";
import { transferOwnership } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const { newOwnerId } = (await request.json().catch(() => ({}))) as { newOwnerId?: string };

  if (!newOwnerId || typeof newOwnerId !== "string") {
    return NextResponse.json({ error: "A valid new owner user ID is required." }, { status: 400 });
  }

  try {
    await transferOwnership(id, session.uid, newOwnerId);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}

