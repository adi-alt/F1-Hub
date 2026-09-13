import { NextResponse } from "next/server";
import { getMemberRole, removeGroupBanner, updateGroupBanner } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ServiceError } from "@/services/errors";

const MAX_BYTES = 3 * 1024 * 1024; // matches the group-banners bucket's own file_size_limit
const CONTENT_TYPE_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

// Mirrors avatar/route.ts exactly - same admin check, same upsert-fixed-path-per-group,
// same cache-busted public URL - just the group-banners bucket and updateGroupBanner instead.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;

  const role = await getMemberRole(id, session.uid);
  if (role !== "admin") return NextResponse.json({ error: "Only a group admin can change the banner." }, { status: 403 });

  const form = await request.formData();
  const file = form.get("banner");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  const ext = CONTENT_TYPE_EXT[file.type];
  if (!ext) return NextResponse.json({ error: "PNG, JPEG, or WEBP only." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image must be under 3MB." }, { status: 400 });

  const path = `${id}/banner.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage
    .from("group-banners")
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError) return NextResponse.json({ error: "Upload failed." }, { status: 500 });

  const { data: publicUrl } = supabaseAdmin.storage.from("group-banners").getPublicUrl(path);
  const bannerUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;

  try {
    await updateGroupBanner(id, session.uid, bannerUrl);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
  return NextResponse.json({ bannerUrl });
}

export async function DELETE(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;

  const role = await getMemberRole(id, session.uid);
  if (role !== "admin") return NextResponse.json({ error: "Only a group admin can change the banner." }, { status: 403 });

  try {
    await removeGroupBanner(id, session.uid);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
  return NextResponse.json({ ok: true });
}
