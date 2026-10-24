import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { limitRequest } from "@/lib/rateLimit";
import { mentionedIn, searchSite } from "@/lib/search";

const MAX_MENTIONS_TEXT = 2000;

/**
 * GET /api/search?q= - the command palette's results (audit R-55); an empty q gives its suggestions.
 * GET /api/search?mentions= - the pages named in an Apex answer, for its source chips. Signed-in only, rate-limited per user.
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await limitRequest(request, "search", session.uid);
  if (limited) return limited;
  const params = new URL(request.url).searchParams;
  const mentions = params.get("mentions");
  const results = mentions !== null ? await mentionedIn(mentions.slice(0, MAX_MENTIONS_TEXT)) : await searchSite(session.uid, params.get("q") ?? "");
  return NextResponse.json({ results }, { headers: { "Cache-Control": "private, no-store" } });
}
