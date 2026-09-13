import { revalidateTag } from "next/cache";
import { NextResponse } from "next/server";

/** Lets a pipeline run signal "real data changed" the moment it actually finishes, instead of
 * every page relying on a blind timer to eventually notice. This is the whole reason
 * unstable_cache's revalidate window can stay long (a day) rather than needing to be short
 * enough to "feel fresh" after a backfill — a short window was itself the problem: it meant
 * every page did a full Firestore rescan on every cache miss, all day, whether or not anything
 * had actually changed, which is what burned through the daily read quota in the first place.
 *
 * Protected by CRON_SECRET (already set for the repo's other automation) since this is the one
 * archive-adjacent endpoint with no user session to check instead — it's meant to be called by
 * the pipeline scripts, not a browser. */
export async function POST(request: Request) {
  const secret = request.headers.get("x-cron-secret");
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = (await request.json().catch(() => ({}))) as { tag?: string };
  const tag = body.tag ?? "archive-data";
  // "max" = stale-while-revalidate: the next visitor gets last-known-good data instantly while
  // this fetches fresh in the background, rather than being the one unlucky request that blocks
  // on a full Firestore re-read.
  revalidateTag(tag, "max");
  return NextResponse.json({ ok: true, revalidated: tag });
}
