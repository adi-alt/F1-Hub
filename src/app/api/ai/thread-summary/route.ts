import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/session/getSession";
import { guardAIExecution } from "@/lib/ai/guardrails";
import { getPostById, listComments } from "@/lib/supabase/groupPosts";
import { summarizeThread } from "@/lib/ai/threadSummary";

export const maxDuration = 30;

export async function POST(req: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const guard = await guardAIExecution(session.uid, req);
  if (!guard.allowed) return NextResponse.json({ error: "Too many requests - give it a moment." }, { status: 429 });

  const body = (await req.json().catch(() => null)) as { postId?: unknown } | null;
  const postId = typeof body?.postId === "string" ? body.postId : null;

  if (!postId) {
    return NextResponse.json({ error: "Missing postId" }, { status: 400 });
  }

  try {
    const post = await getPostById(postId, session.uid);
    if (!post) {
      return NextResponse.json({ error: "Post not found or inaccessible" }, { status: 404 });
    }

    const comments = await listComments(post.groupId, postId, session.uid);
    const commentInputs = comments.map((c) => ({
      author: c.authorName,
      content: c.content,
      score: c.score,
    }));

    const requestId = `tsum_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;
    const summary = await summarizeThread(postId, post.title, post.content, commentInputs, requestId);

    return NextResponse.json({ summary });
  } catch (err) {
    console.error("POST /api/ai/thread-summary:", err);
    return NextResponse.json({ error: "Could not summarize discussion" }, { status: 500 });
  }
}
