import { NextResponse } from "next/server";
import { listOpenReports } from "@/lib/supabase/moderation";
import { getSession } from "@/lib/session/getSession";
import { ServiceError } from "@/services/errors";

/** The community's open report queue - moderators and admins only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  try {
    return NextResponse.json({ reports: await listOpenReports(id, session.uid) });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
}
