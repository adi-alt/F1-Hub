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

/** Where the site serves an upload: through a route that checks the viewer may see the post it's in (a private
 * community's photos are its members'), rather than the bucket's own address. */
export const SERVED_MEDIA_PREFIX = "/api/posts/media/file?path=";
/** An object in the bucket: `<uploader>/<file>.<ext>`, as the upload route names them. */
const MEDIA_PATH = /^[\w-]{1,64}\/[\w-]{1,64}\.[a-z0-9]{2,5}$/i;

/** The bucket path of a stored upload URL, or null for anything else (a GIF). */
export function mediaPathOf(storedUrl: string): string | null {
  const origin = storageOrigin();
  if (!origin || !storedUrl.startsWith(`${origin}${POST_MEDIA_PATH}`)) return null;
  const path = decodeURIComponent(storedUrl.slice(origin.length + POST_MEDIA_PATH.length));
  return MEDIA_PATH.test(path) ? path : null;
}

/** The URL a stored upload is shown at (GIFs keep their own). */
export function servedMediaUrl(storedUrl: string): string {
  const path = mediaPathOf(storedUrl);
  return path ? `${SERVED_MEDIA_PREFIX}${encodeURIComponent(path)}` : storedUrl;
}

/** Back from the served form to the stored one, for a write: the composer hands back what it was shown. Anything that
 * isn't a served URL passes through untouched, to be checked by isAllowedMediaUrl. */
export function storedMediaUrl(value: string): string {
  if (!value.startsWith(SERVED_MEDIA_PREFIX)) return value;
  const path = decodeURIComponent(value.slice(SERVED_MEDIA_PREFIX.length));
  const origin = storageOrigin();
  return origin && MEDIA_PATH.test(path) ? `${origin}${POST_MEDIA_PATH}${path}` : value;
}

/** The URL to show when it is allowed, otherwise null - for mapping stored rows. */
export function allowedMediaUrl(value: unknown): string | null {
  return isAllowedMediaUrl(value) ? servedMediaUrl(value) : null;
}
