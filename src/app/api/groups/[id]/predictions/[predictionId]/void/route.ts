import { NextResponse } from "next/server";
import { voidPrediction } from "@/lib/supabase/groupPredictions";
import { getSession } from "@/lib/session/getSession";
import { isUuid } from "@/lib/ids";
import { ServiceError, serviceErrorBody } from "@/services/errors";

/** Void a round (community admin): everyone's entry is refunded. Idempotent, like resolve. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string; predictionId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, predictionId } = await params;
  if (!isUuid(id) || !isUuid(predictionId)) return NextResponse.json({ error: "Prediction not found.", code: "prediction_not_found" }, { status: 404 });

  try {
    return NextResponse.json({ ok: true, ...(await voidPrediction(id, predictionId, session.uid)) });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json(serviceErrorBody(err), { status: err.httpStatus });
    throw err;
  }
}
