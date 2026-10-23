import { NextResponse } from "next/server";
import { reportContent } from "@/lib/supabase/moderation";
import { getSession } from "@/lib/session/getSession";
import { limitRequest } from "@/lib/rateLimit";
import { isUuid } from "@/lib/ids";
import { ServiceError } from "@/services/errors";

/** Reports a community post, or one of its comments (`commentId`), to that community's moderators. */
export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await limitRequest(request, "report", session.uid);
  if (limited) return limited;
  const { postId } = await params;
  const { reason, commentId } = (await request.json().catch(() => ({}))) as { reason?: string; commentId?: string | null };
  if (typeof reason !== "string") return NextResponse.json({ error: "Missing reason" }, { status: 400 });
  if (commentId != null && !isUuid(commentId)) return NextResponse.json({ error: "Invalid comment" }, { status: 400 });
  try {
    await reportContent(postId, session.uid, { reason, commentId });
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
