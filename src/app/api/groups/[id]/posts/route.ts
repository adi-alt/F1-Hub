import { NextResponse } from "next/server";
import type { PostKind } from "@/lib/communities";
import { createPost, listPosts } from "@/lib/supabase/groupPosts";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const { searchParams } = new URL(_request.url);
  try {
    const page = await listPosts(id, session.uid, {
      cursor: searchParams.get("cursor") ?? undefined,
      mediaOnly: searchParams.get("mediaOnly") === "1",
    });
    return NextResponse.json(page);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  // `kind` is re-validated against the community's own enabled modules inside createPost - a kind
  // this community doesn't offer is a 400 there, not something this route has to know about.
  const { title, content, mediaUrl, kind } = (await request.json().catch(() => ({}))) as {
    title?: string;
    content?: string;
    mediaUrl?: string | null;
    kind?: PostKind;
  };
  if (typeof content !== "string") return NextResponse.json({ error: "Missing content" }, { status: 400 });

  try {
    const post = await createPost(id, session.uid, { title, content, mediaUrl, kind });
    return NextResponse.json(post);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
