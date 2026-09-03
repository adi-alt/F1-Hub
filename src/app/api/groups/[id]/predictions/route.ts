import { NextResponse } from "next/server";
import { createPrediction, listPredictions, type PredictionType } from "@/lib/supabase/groupPredictions";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  try {
    const predictions = await listPredictions(id, session.uid);
    return NextResponse.json({ predictions });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  const body = (await request.json().catch(() => ({}))) as { raceId?: string; type?: PredictionType; entryPoints?: number };
  if (!body.raceId || !body.type) return NextResponse.json({ error: "Missing raceId or type" }, { status: 400 });

  try {
    const prediction = await createPrediction(id, session.uid, { raceId: body.raceId, type: body.type, entryPoints: body.entryPoints ?? 0 });
    return NextResponse.json(prediction);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
