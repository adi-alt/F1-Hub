import { NextResponse } from "next/server";
import { getMemberRole, updateGroupAvatar } from "@/lib/supabase/groups";
import { getSession } from "@/lib/session/getSession";
import { supabaseAdmin } from "@/lib/supabase/admin";
import { ServiceError } from "@/services/errors";

const MAX_BYTES = 2 * 1024 * 1024; // matches the group-avatars bucket's own file_size_limit
const CONTENT_TYPE_EXT: Record<string, string> = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp" };

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });
  const { id } = await params;

  const role = await getMemberRole(id, session.uid);
  if (role !== "admin") return NextResponse.json({ error: "Only a group admin can change the avatar." }, { status: 403 });

  const form = await request.formData();
  const file = form.get("avatar");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  const ext = CONTENT_TYPE_EXT[file.type];
  if (!ext) return NextResponse.json({ error: "PNG, JPEG, or WEBP only." }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ error: "Image must be under 2MB." }, { status: 400 });

  // Same path every re-upload (upsert: true) rather than a fresh filename per upload — an old
  // avatar left orphaned in Storage with nothing pointing at it is exactly the kind of cleanup
  // this sidesteps entirely.
  const path = `${id}/avatar.${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage
    .from("group-avatars")
    .upload(path, buffer, { contentType: file.type, upsert: true });
  if (uploadError) return NextResponse.json({ error: "Upload failed." }, { status: 500 });

  const { data: publicUrl } = supabaseAdmin.storage.from("group-avatars").getPublicUrl(path);
  // Cache-bust: the path (and so the URL) never changes across re-uploads, so without this a
  // browser/CDN that already cached the old image would keep serving it.
  const avatarUrl = `${publicUrl.publicUrl}?v=${Date.now()}`;

  try {
    await updateGroupAvatar(id, session.uid, avatarUrl);
  } catch (err) {
    if (err instanceof ServiceError) return NextResponse.json({ error: err.message }, { status: err.httpStatus });
    throw err;
  }
  return NextResponse.json({ avatarUrl });
}
