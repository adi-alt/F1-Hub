import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { listPipelineRuns } from "@/models/services/models.service";
import { ServiceError } from "@/services/errors";

export async function GET() {
  const session = await getSession();
  try {
    const runs = await listPipelineRuns(session.uid);
    return NextResponse.json({ runs });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
