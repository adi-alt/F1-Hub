import { NextResponse } from "next/server";
import { publishDueScheduledPosts } from "@/lib/supabase/groupPosts";

/**
 * Flips scheduled posts to published once their time has passed.
 *
 * Invoked by Vercel Cron (see vercel.json), which sends the project's CRON_SECRET as a bearer
 * token. Without that secret configured this endpoint refuses every request rather than defaulting
 * to open - an unauthenticated publisher would let anyone force-publish the whole scheduled queue
 * early.
 *
 * publishDueScheduledPosts is idempotent (its update is filtered on status = 'scheduled'), so an
 * overlapping or repeated invocation is harmless.
 */
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Publisher is not configured." }, { status: 503 });

  const provided = request.headers.get("authorization");
  if (provided !== `Bearer ${secret}`) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const published = await publishDueScheduledPosts();
  return NextResponse.json({ published });
}
