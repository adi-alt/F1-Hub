import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { limitRequest } from "@/lib/rateLimit";
import { isUuid } from "@/lib/ids";
import { setSaved } from "@/lib/supabase/groupPosts";
import { ServiceError } from "@/services/errors";

/** Saves are a group-agnostic post action: personal posts and community posts use the same route. */
async function change(request: Request, postId: string, saved: boolean) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await limitRequest(request, "postSave", session.uid);
  if (limited) return limited;
  if (!isUuid(postId)) return NextResponse.json({ error: "Invalid post id" }, { status: 400 });

  try {
    return NextResponse.json(await setSaved(postId, session.uid, saved));
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  return change(request, (await params).postId, true);
}

export async function DELETE(request: Request, { params }: { params: Promise<{ postId: string }> }) {
  return change(request, (await params).postId, false);
}
