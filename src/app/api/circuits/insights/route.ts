// POST /api/circuits/insights
//
// The Circuits homepage's deterministic (non-LLM) per-circuit stats - real computed track
// records/trends plus the signed-in user's own "your history here" overlay. Deliberately its own
// small endpoint, not a slice of /api/ai/circuit-take: this has no LLM call, no cache, nothing to
// validate for evidence grounding - it's a direct, cheap, real-data computation that the homepage
// can call on every circuit selection without worrying about AI latency or cost.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { getCircuitInsightsData } from "@/app/circuits/services/circuits.service";

export async function POST(req: Request) {
  try {
    const session = await getSession();
    if (!session.uid) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    const body: unknown = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    const { location, year } = body as { location?: unknown; year?: unknown };
    if (typeof location !== "string" || !location.trim()) return NextResponse.json({ error: "MISSING_LOCATION" }, { status: 400 });
    if (typeof year !== "number" || !Number.isInteger(year)) return NextResponse.json({ error: "INVALID_YEAR" }, { status: 400 });

    const data = await getCircuitInsightsData(location, year, session.uid);
    if (!data) return NextResponse.json({ error: "UNKNOWN_CIRCUIT" }, { status: 404 });

    return NextResponse.json({ location, data });
  } catch (err) {
    console.error("circuit insights route exception:", err);
    return NextResponse.json({ error: "INSIGHTS_UNAVAILABLE" }, { status: 503 });
  }
}
