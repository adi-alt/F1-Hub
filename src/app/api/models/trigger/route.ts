import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { triggerPipelineRun } from "@/app/models/services/models.service";
import { ServiceError } from "@/services/errors";

export async function POST(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { workflow } = (await request.json()) as { workflow?: string };
  if (!workflow) return NextResponse.json({ error: "Unknown workflow" }, { status: 400 });

  try {
    await triggerPipelineRun(session.uid, workflow);
    return NextResponse.json({ ok: true });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
