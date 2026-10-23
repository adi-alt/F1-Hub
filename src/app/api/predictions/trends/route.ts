import { NextResponse } from "next/server";
import { getPredictionTrends, MAX_TREND_BATCH } from "@/lib/supabase/groupPredictions";
import { getSession } from "@/lib/session/getSession";

/**
 * GET the community trend for many prediction rounds in one request: `?ids=a,b,c` (at most
 * MAX_TREND_BATCH). Returns `{ trends: { [predictionId]: PredictionTrend } }`, leaving out rounds
 * in communities the viewer isn't a member of. A feed or a community's Predictions tab asks once
 * for every card on screen instead of each card fetching its own /trend.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const ids = (new URL(request.url).searchParams.get("ids") ?? "")
    .split(",")
    .map((id) => id.trim())
    .filter(Boolean);
  if (ids.length > MAX_TREND_BATCH) return NextResponse.json({ error: `At most ${MAX_TREND_BATCH} ids per request.` }, { status: 400 });
  const trends = await getPredictionTrends(ids, session.uid);
  return NextResponse.json({ trends });
}
