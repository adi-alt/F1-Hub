import { NextResponse } from "next/server";
import { createPost, listPosts } from "@/lib/supabase/groupPosts";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  try {
    const posts = await listPosts(id, session.uid);
    return NextResponse.json({ posts });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const { content } = (await request.json().catch(() => ({}))) as { content?: string };
  if (typeof content !== "string") return NextResponse.json({ error: "Missing content" }, { status: 400 });

  try {
    const post = await createPost(id, session.uid, content);
    return NextResponse.json(post);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
