import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { isUuid } from "@/lib/ids";
import { setCommentsLocked } from "@/lib/supabase/moderation";
import { ServiceError } from "@/services/errors";

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { postId } = await params;
  if (!isUuid(postId)) return NextResponse.json({ error: "Invalid post id" }, { status: 400 });
  const body = (await request.json().catch(() => ({}))) as { locked?: boolean };
  if (typeof body.locked !== "boolean") return NextResponse.json({ error: "Invalid lock state" }, { status: 400 });
  try {
    await setCommentsLocked(postId, session.uid, body.locked);
    return NextResponse.json({ commentsLocked: body.locked });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
