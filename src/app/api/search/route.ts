import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { limitRequest } from "@/lib/rateLimit";
import { searchSite } from "@/lib/search";

/** GET /api/search?q= - the command palette's results (audit R-55). Signed-in only, rate-limited per user. */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await limitRequest(request, "search", session.uid);
  if (limited) return limited;
  const q = new URL(request.url).searchParams.get("q") ?? "";
  return NextResponse.json({ results: await searchSite(session.uid, q) }, { headers: { "Cache-Control": "private, no-store" } });
}
