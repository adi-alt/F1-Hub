import { NextResponse } from "next/server";
import { searchGifs } from "@/lib/gifProvider";
import { getSession } from "@/lib/session/getSession";

export async function GET(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const { searchParams } = new URL(request.url);
  const q = searchParams.get("q") ?? "";
  const results = await searchGifs(q);
  // Distinguishes "no provider configured" from "searched, found nothing" so GifPicker can show
  // an honest message instead of a plain empty grid either way.
  return NextResponse.json({ results, configured: !!process.env.TENOR_API_KEY });
}
