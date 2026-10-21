import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { getMemberRole } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { storedMediaUrl, SERVED_MEDIA_PREFIX } from "@/lib/mediaUrls";

/**
 * A post's photo, video or file, for someone allowed to see the post: its uploader (the composer's preview, before
 * the post exists), anyone signed in for a personal post, and only members for a community's. A private community's
 * media is then as private as its posts, whatever the bucket's own setting. Anything else is a 404, the same as a file
 * that doesn't exist, so this can't be used to probe. Videos get byte ranges (Safari won't play one without them).
 */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const url = new URL(request.url);
  const stored = storedMediaUrl(`${SERVED_MEDIA_PREFIX}${encodeURIComponent(url.searchParams.get("path") ?? "")}`);
  if (stored.startsWith(SERVED_MEDIA_PREFIX)) return notFound(); // not a valid path
  const path = decodeURIComponent(new URL(stored).pathname.split("/post-media/")[1] ?? "");

  if (!path.startsWith(`${session.uid}/`) && !(await mayView(stored, session.uid))) return notFound();

  const { data: blob, error } = await supabaseAdmin.storage.from("post-media").download(path);
  if (error || !blob) return notFound();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const headers = { "Content-Type": blob.type || "application/octet-stream", "Cache-Control": "private, max-age=3600", "Accept-Ranges": "bytes" };

  const range = /^bytes=(\d*)-(\d*)$/.exec(request.headers.get("range") ?? "");
  if (range && (range[1] || range[2])) {
    const start = range[1] ? Number(range[1]) : Math.max(0, bytes.length - Number(range[2]));
    const end = range[1] && range[2] ? Math.min(Number(range[2]), bytes.length - 1) : bytes.length - 1;
    if (start >= bytes.length || start > end) return new NextResponse(null, { status: 416, headers: { "Content-Range": `bytes */${bytes.length}` } });
    return new NextResponse(bytes.slice(start, end + 1), { status: 206, headers: { ...headers, "Content-Range": `bytes ${start}-${end}/${bytes.length}` } });
  }
  return new NextResponse(bytes, { headers });
}

const notFound = () => NextResponse.json({ error: "Not found." }, { status: 404 });

/** Whether a post this file belongs to (as its media or its thumbnail) is one the viewer can see. */
async function mayView(stored: string, uid: string): Promise<boolean> {
  for (const column of ["media_url", "media_thumb_url"]) {
    const { data } = await supabaseAdmin.from("group_posts").select("group_id").eq(column, stored).limit(1).maybeSingle();
    if (!data) continue;
    return !data.group_id || !!(await getMemberRole(data.group_id as string, uid));
  }
  return false;
}
