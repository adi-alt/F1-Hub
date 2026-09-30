import { NextResponse } from "next/server";
import { enterPrediction } from "@/lib/supabase/groupPredictions";
import { getSession } from "@/lib/session/getSession";
import { isUuid } from "@/lib/ids";
import { ServiceError, serviceErrorBody } from "@/services/errors";

/**
 * Enter or change a prediction. The server decides whether the round is still open: entries and
 * edits are refused (409, code "prediction_locked") from the start of the weekend's main Qualifying
 * session, whatever the client thinks. The response carries the authoritative `lockAt` so the UI can
 * show the same deadline the server enforces.
 */
export async function POST(request: Request, { params }: { params: Promise<{ id: string; predictionId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, predictionId } = await params;
  if (!isUuid(id) || !isUuid(predictionId)) return NextResponse.json({ error: "Prediction not found.", code: "prediction_not_found" }, { status: 404 });
  const { guess } = (await request.json().catch(() => ({}))) as { guess?: unknown };

  try {
    const result = await enterPrediction(id, predictionId, session.uid, guess);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json(serviceErrorBody(err), { status: err.httpStatus });
    throw err;
  }
}
