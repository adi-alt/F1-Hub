import { NextResponse } from "next/server";
import { resolvePrediction } from "@/lib/supabase/groupPredictions";
import { getSession } from "@/lib/session/getSession";
import { isUuid } from "@/lib/ids";
import { ServiceError, serviceErrorBody } from "@/services/errors";

/**
 * Resolve a round (community admin). Idempotent: resolving an already-resolved round succeeds with
 * `alreadyResolved: true` and moves no points, so a double click, a retry, or two admins acting at
 * once can never pay anyone twice.
 */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string; predictionId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, predictionId } = await params;
  if (!isUuid(id) || !isUuid(predictionId)) return NextResponse.json({ error: "Prediction not found.", code: "prediction_not_found" }, { status: 404 });

  try {
    const result = await resolvePrediction(id, predictionId, session.uid);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json(serviceErrorBody(err), { status: err.httpStatus });
    throw err;
  }
}
