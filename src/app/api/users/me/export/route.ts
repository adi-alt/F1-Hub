import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { exportAccountData } from "@/lib/supabase/account";

/** GET /api/users/me/export - everything the signed-in person owns, as a JSON download (audit R-53). Only ever their
 * own: the uid comes from the session, never the request. */
export async function GET() {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const data = await exportAccountData(session.uid);
  return new NextResponse(JSON.stringify(data, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="apex-f1-hub-data-${data.exportedAt.slice(0, 10)}.json"`,
      "Cache-Control": "private, no-store",
    },
  });
}
