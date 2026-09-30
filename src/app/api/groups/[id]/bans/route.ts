import { NextResponse } from "next/server";
import { listBans } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { isUuid } from "@/lib/ids";
import { ServiceError, serviceErrorBody } from "@/services/errors";

/** People barred from rejoining this community. Admins only. */
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;
  if (!isUuid(id)) return NextResponse.json({ error: "Community not found." }, { status: 404 });
  try {
    return NextResponse.json({ bans: await listBans(id, session.uid) });
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json(serviceErrorBody(err), { status: err.httpStatus });
    throw err;
  }
}
