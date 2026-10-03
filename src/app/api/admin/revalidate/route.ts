import { expireTag } from "@/lib/cacheTags";
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
  // Expired now, not stale-while-revalidate (audit R-19): the pipeline only calls this when real data
  // changed - results, the grid - and the next visitor should see it, not the version from before.
  // The blocking re-read this costs one request is a Postgres query (the old reason for
  // stale-while-revalidate was Firestore's read quota, which no longer applies).
  expireTag(tag);
  return NextResponse.json({ ok: true, revalidated: tag });
}
