import { NextResponse } from "next/server";
import { getPredictionTrend } from "@/lib/supabase/groupPredictions";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

/**
 * GET the community's aggregated entries for one prediction round.
 *
 * Counts only - never individual entries - and membership-gated inside getPredictionTrend itself
 * (which re-derives the round's own group from the database rather than trusting the `id` in the
 * path, so a member of community A can't read community B's trend by rewriting the URL).
 */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string; predictionId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { predictionId } = await params;

  try {
    const trend = await getPredictionTrend(predictionId, session.uid);
    return NextResponse.json(trend);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
