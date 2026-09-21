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
  "application/vnd.ms-powerpoint": { ext: "ppt", maxBytes: OTHER_MAX_BYTES },
  "application/vnd.openxmlformats-officedocument.presentationml.presentation": { ext: "pptx", maxBytes: OTHER_MAX_BYTES },
  "text/plain": { ext: "txt", maxBytes: OTHER_MAX_BYTES },
  "text/markdown": { ext: "md", maxBytes: OTHER_MAX_BYTES },
  "text/csv": { ext: "csv", maxBytes: OTHER_MAX_BYTES },
  "application/json": { ext: "json", maxBytes: OTHER_MAX_BYTES },
  "application/zip": { ext: "zip", maxBytes: OTHER_MAX_BYTES },
  "video/quicktime": { ext: "mov", maxBytes: OTHER_MAX_BYTES },
  "audio/mpeg": { ext: "mp3", maxBytes: OTHER_MAX_BYTES },
  "audio/wav": { ext: "wav", maxBytes: OTHER_MAX_BYTES },
  "audio/mp4": { ext: "m4a", maxBytes: OTHER_MAX_BYTES },
};

/** Storage paths are random by design (no collisions, no guessable URLs), so the ONLY place the
 * file's real name can survive is metadata carried alongside it. Sanitised, not trusted: a name
 * is display text, and control characters or a path separator in it have no business reaching a
 * download attribute. */
function safeOriginalName(raw: string): string {
  const base = raw.split(/[/\\]/).pop() ?? raw;
  return base.replace(/[\u0000-\u001f\u007f]/g, "").slice(0, 200).trim() || "attachment";
}

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

  // An optional first-page/frame image, rendered by the client at pick time and sent with the
  // file. Generated once, at upload, rather than per feed render - a feed of fifty posts must
  // never rasterise fifty PDFs. A thumbnail that fails to upload is simply absent: the post still
  // publishes and the attachment falls back to its typed card.
  let thumbUrl: string | null = null;
  const thumb = form.get("thumbnail");
  if (thumb instanceof File && thumb.size > 0 && thumb.size <= IMAGE_MAX_BYTES && thumb.type === "image/png") {
    const thumbPath = `${session.uid}/${randomUUID()}.png`;
    const { error: thumbError } = await supabaseAdmin.storage
      .from("post-media")
      .upload(thumbPath, Buffer.from(await thumb.arrayBuffer()), { contentType: "image/png" });
    if (!thumbError) thumbUrl = supabaseAdmin.storage.from("post-media").getPublicUrl(thumbPath).data.publicUrl;
  }

  const pagesRaw = form.get("pages");
  const pages = typeof pagesRaw === "string" && /^\d{1,5}$/.test(pagesRaw) ? Number(pagesRaw) : null;

  return NextResponse.json({
    mediaUrl: publicUrl.publicUrl,
    name: safeOriginalName(file.name),
    mime: file.type,
    size: file.size,
    thumbUrl,
    pages,
  });
}
