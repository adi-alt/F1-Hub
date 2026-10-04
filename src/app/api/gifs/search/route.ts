import { NextResponse } from "next/server";
import { gifProviderConfigured, searchGifs } from "@/lib/gifProvider";
import { getSession } from "@/lib/session/getSession";
import { limitRequest } from "@/lib/rateLimit";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const limited = await limitRequest(request, "gifSearch", session.uid);
  if (limited) return limited;

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const results = await searchGifs(q);
  // Distinguishes "no provider configured" from "searched, found nothing" so GifPicker can show
  // an honest message instead of a plain empty grid either way.
  return NextResponse.json({ results, configured: gifProviderConfigured() });
}
