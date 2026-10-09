import { NextResponse } from "next/server";
import { expireTag } from "@/lib/cacheTags";
import { getSiteAdmin } from "@/lib/siteAdmin";
import { approveCandidate, rejectCandidate, removeApproved, ReviewError, RACE_PHOTOS_TAG } from "@/lib/supabase/racePhotos";

type Body = { action?: unknown; id?: unknown };

/**
 * Admin review of race photo candidates: approve (copy to race_photos), reject, or remove an approved photo.
 * Site admins only, checked against the live profile. JSON only: a cross-site form can't send it without a
 * CORS preflight this route never answers, so the session cookie alone can't be ridden.
 */
export async function POST(request: Request) {
  if (!request.headers.get("content-type")?.startsWith("application/json")) {
    return NextResponse.json({ error: "Expected JSON." }, { status: 415 });
  }
  const admin = await getSiteAdmin();
  if (!admin) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = (await request.json().catch(() => ({}))) as Body;
  const id = typeof body.id === "number" && Number.isInteger(body.id) && body.id > 0 ? body.id : null;
  if (!id) return NextResponse.json({ error: "Missing id." }, { status: 400 });

  try {
    let raceId: string;
    if (body.action === "approve") raceId = await approveCandidate(id, admin.uid);
    else if (body.action === "reject") raceId = await rejectCandidate(id, admin.uid);
    else if (body.action === "remove") raceId = await removeApproved(id, admin.uid);
    else return NextResponse.json({ error: "Unknown action." }, { status: 400 });
    // Approvals change what the race page shows; the next visitor gets the new set.
    expireTag(RACE_PHOTOS_TAG);
    return NextResponse.json({ ok: true, raceId });
  } catch (err) {
    if (err instanceof ReviewError) return NextResponse.json({ error: err.message }, { status: err.status });
    throw err;
  }
}
