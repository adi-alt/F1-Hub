import { NextResponse } from "next/server";
import { requireModerator } from "@/lib/supabase/moderation";
import { readModerationLog } from "@/lib/supabase/moderationLog";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

/** Who approved, removed or dismissed what in this community, newest first - moderators and admins only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  try {
    await requireModerator(id, session.uid);
    return NextResponse.json({ entries: await readModerationLog(id) });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
