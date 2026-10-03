/** Where a post's attachment may point (audit SEC-17).
 *
 * `mediaUrl` and `thumbUrl` arrive from the client and are rendered as <img>, <video>, <audio> and
 * download links, so an arbitrary string would allow tracking pixels, phishing "attachments" and
 * `data:`/`javascript:` URLs. Only two sources are real: files the upload route put in this
 * project's public `post-media` bucket, and GIFs from Klipy, whose renditions are all served from
 * static.klipy.com (checked against a live search response). Everything else is refused on write and
 * dropped on read, so a row written before this check can't render one either. */

const KLIPY_CDN_ORIGIN = "https://static.klipy.com";
const POST_MEDIA_PATH = "/storage/v1/object/public/post-media/";
const MAX_MEDIA_URL_CHARS = 2048;

function storageOrigin(): string | null {
  try {
    return new URL(process.env.NEXT_PUBLIC_SUPABASE_URL ?? "").origin;
  } catch {
    return null;
  }
}

export function isAllowedMediaUrl(value: unknown): value is string {
  if (typeof value !== "string" || value.length > MAX_MEDIA_URL_CHARS) return false;
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password) return false;
  if (url.origin === KLIPY_CDN_ORIGIN) return true;
  // The URL parser has already resolved any "../" (encoded or not), so the prefix check can't be
  // walked out of the bucket.
  return url.origin === storageOrigin() && url.pathname.startsWith(POST_MEDIA_PATH);
}

/** The URL when it is allowed, otherwise null - for mapping stored rows. */
export function allowedMediaUrl(value: unknown): string | null {
  return isAllowedMediaUrl(value) ? value : null;
}
