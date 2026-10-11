import { NextResponse } from "next/server";
import { createPrediction, type PredictionType } from "@/lib/supabase/groupPredictions";
import { getSession } from "@/lib/session/getSession";
import { limitRequest } from "@/lib/rateLimit";
import { ServiceError, serviceErrorBody } from "@/services/errors";

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await limitRequest(request, "predictionCreate", session.uid);
  if (limited) return limited;
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { raceId?: string; type?: PredictionType; entryPoints?: number };
  if (!body.raceId || !body.type) return NextResponse.json({ error: "Missing raceId or type" }, { status: 400 });

  try {
    const prediction = await createPrediction(id, session.uid, { raceId: body.raceId, type: body.type, entryPoints: body.entryPoints ?? 0 });
    return NextResponse.json(prediction);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json(serviceErrorBody(err), { status: err.httpStatus });
    throw err;
  }
}
