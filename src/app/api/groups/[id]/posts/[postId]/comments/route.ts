import { NextResponse } from "next/server";
import { addComment, listComments } from "@/lib/supabase/groupPosts";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; postId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, postId } = await params;
  try {
    const comments = await listComments(id, postId, session.uid);
    return NextResponse.json({ comments });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string; postId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, postId } = await params;
  const { content } = (await request.json().catch(() => ({}))) as { content?: string };
  if (typeof content !== "string") return NextResponse.json({ error: "Missing content" }, { status: 400 });

  try {
    const comment = await addComment(id, postId, session.uid, content);
    return NextResponse.json(comment);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
