import { NextResponse } from "next/server";
import { inviteByEmail } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const { emails } = (await request.json().catch(() => ({}))) as { emails?: string[] };
  if (!Array.isArray(emails)) return NextResponse.json({ error: "Missing emails" }, { status: 400 });

  try {
    const result = await inviteByEmail(id, session.uid, emails, new URL(request.url).origin);
    return NextResponse.json(result);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
