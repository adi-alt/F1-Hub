import { NextResponse } from "next/server";
import { unstable_cache } from "next/cache";
import { fetchLinkPreview } from "@/lib/linkPreview";
import { getSession } from "@/lib/session/getSession";

/**
 * GET /api/link-preview?url=...
 *
 * Session-gated, so this can't be used as an open URL-fetching proxy by anyone who finds it. The
 * result is cached per URL for a day: a link shared in a feed is requested once per reader
 * otherwise, and the metadata behind it changes on the order of never.
 *
 * A URL that can't be fetched, isn't HTML, or carries no usable metadata returns 204 rather than an
 * error - "there is no preview for this" is a normal outcome, and the card simply doesn't render.
 */
const CACHE_SECONDS = 60 * 60 * 24;

const cachedPreview = unstable_cache(async (url: string) => fetchLinkPreview(url), ["link-preview"], { revalidate: CACHE_SECONDS });

export async function GET(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(request.url).searchParams.get("url");
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  const preview = await cachedPreview(url);
  // Nothing worth showing: no title AND no image is an empty card, not a preview.
  if (!preview || (!preview.title && !preview.imageUrl)) return new NextResponse(null, { status: 204 });

  return NextResponse.json(preview, { headers: { "Cache-Control": `private, max-age=${CACHE_SECONDS}` } });
}
