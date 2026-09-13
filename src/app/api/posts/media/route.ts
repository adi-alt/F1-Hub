import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { supabaseAdmin } from "@/lib/supabase/admin";

const IMAGE_MAX_BYTES = 500 * 1024;
const OTHER_MAX_BYTES = 2 * 1024 * 1024;

// ext -> [mime, max bytes for that mime, "image"|"video"|"document" for PostMedia's own rendering
// choice]. One map, not three separate checks, so "is this type allowed" and "what's its cap"
// can't drift out of sync with each other.
const MEDIA_TYPES: Record<string, { ext: string; maxBytes: number }> = {
  "image/png": { ext: "png", maxBytes: IMAGE_MAX_BYTES },
  "image/jpeg": { ext: "jpg", maxBytes: IMAGE_MAX_BYTES },
  "image/webp": { ext: "webp", maxBytes: IMAGE_MAX_BYTES },
  "image/gif": { ext: "gif", maxBytes: IMAGE_MAX_BYTES },
  "video/mp4": { ext: "mp4", maxBytes: OTHER_MAX_BYTES },
  "video/webm": { ext: "webm", maxBytes: OTHER_MAX_BYTES },
  "application/pdf": { ext: "pdf", maxBytes: OTHER_MAX_BYTES },
  "application/msword": { ext: "doc", maxBytes: OTHER_MAX_BYTES },
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": { ext: "docx", maxBytes: OTHER_MAX_BYTES },
  "application/vnd.ms-excel": { ext: "xls", maxBytes: OTHER_MAX_BYTES },
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": { ext: "xlsx", maxBytes: OTHER_MAX_BYTES },
};

/** Post media upload - images (500KB), video and documents (2MB each, the product's own stated
 * caps - different types, different limits, not one flat number for everything). Unlike group
 * avatar/banner (one fixed path, upsert on re-upload), every upload here is a genuinely new
 * object, keyed by a fresh random id, not the not-yet-created post's id. Validated client-side
 * (the composer's own file picker) and here again (never trust the client alone) - the bucket's
 * own file_size_limit (2MB, the largest of these per-type caps) is a third, storage-level
 * backstop behind both. */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const form = await request.formData();
  const file = form.get("media");
  if (!(file instanceof File)) return NextResponse.json({ error: "Missing file" }, { status: 400 });
  const spec = MEDIA_TYPES[file.type];
  if (!spec) return NextResponse.json({ error: "Unsupported file type." }, { status: 400 });
  if (file.size > spec.maxBytes) {
    const limitLabel = spec.maxBytes === IMAGE_MAX_BYTES ? "500KB" : "2MB";
    return NextResponse.json({ error: `This file type is limited to ${limitLabel}.` }, { status: 400 });
  }

  const path = `${session.uid}/${randomUUID()}.${spec.ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());
  const { error: uploadError } = await supabaseAdmin.storage.from("post-media").upload(path, buffer, { contentType: file.type });
  if (uploadError) return NextResponse.json({ error: "Upload failed." }, { status: 500 });

  const { data: publicUrl } = supabaseAdmin.storage.from("post-media").getPublicUrl(path);
  return NextResponse.json({ mediaUrl: publicUrl.publicUrl, fileName: file.name });
}
