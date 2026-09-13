import { NextResponse } from "next/server";
import { resolvePrediction } from "@/lib/supabase/groupPredictions";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

export async function POST(_request: Request, { params }: { params: Promise<{ id: string; predictionId: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id, predictionId } = await params;

  try {
    await resolvePrediction(id, predictionId, session.uid);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
