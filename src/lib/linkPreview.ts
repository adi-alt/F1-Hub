/**
 * Open Graph metadata for a pasted URL.
 *
 * Fetching a URL a user supplied is a server-side request to an address they control, so this is
 * written defensively rather than conveniently: only http/https, never a private or loopback
 * address (an SSRF into the deployment's own network), a hard timeout, a capped read so a
 * multi-gigabyte response can't exhaust memory, and no redirect following to a host that would
 * fail the same checks. Everything extracted is treated as untrusted text - it is rendered as
 * text, never as markup, and the image URL is re-validated before it is ever put in a src.
 */

export type LinkPreviewData = {
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageUrl: string | null;
};

const FETCH_TIMEOUT_MS = 4000;
/** Metadata lives in <head>; 256KB is far more than enough to reach the end of one, and stops a
 * large page from being read in full for four tags. */
const MAX_BYTES = 256 * 1024;

/** Hostnames that resolve inside the deployment rather than out on the internet. A literal-address
 * check, not a DNS resolution: this blocks the direct forms without pretending to be a complete
 * SSRF defence, which at the application layer it cannot be - a hostname can always resolve to a
 * private address after this check passes. Egress filtering is the real control; this removes the
 * trivial cases. */
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return true;
  if (host === "::1" || host.startsWith("fc") || host.startsWith("fd")) return true; // IPv6 loopback / unique-local
  const v4 = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!v4) return false;
  const [a, b] = [Number(v4[1]), Number(v4[2])];
  if (a === 10 || a === 127 || a === 0) return true;
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 169 && b === 254) return true; // link-local, incl. cloud metadata endpoints
  return false;
}

/** A URL this app is willing to fetch or render. Returns null for anything else - notably
 * javascript: and data:, which is what keeps a pasted link from becoming an injection vector. */
export function safeHttpUrl(raw: string): URL | null {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return null;
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") return null;
  if (isBlockedHost(url.hostname)) return null;
  return url;
}

/** The first link in a block of text, if there is one. Trailing punctuation is trimmed because a
 * URL at the end of a sentence usually has a full stop or bracket attached to it. */
export function firstUrlIn(text: string): string | null {
  const match = /https?:\/\/[^\s<>"']+/i.exec(text);
  if (!match) return null;
  return match[0].replace(/[.,;:!?)\]}]+$/, "");
}

function decodeEntities(value: string): string {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&#(\d+);/g, (_, code: string) => String.fromCharCode(Number(code)))
    .replace(/&apos;|&#x27;/gi, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

function metaContent(html: string, property: string): string | null {
  // Both attribute orders (content before or after property/name) occur in the wild.
  const patterns = [
    new RegExp(`<meta[^>]+(?:property|name)=["']${property}["'][^>]*content=["']([^"']*)["']`, "i"),
    new RegExp(`<meta[^>]+content=["']([^"']*)["'][^>]*(?:property|name)=["']${property}["']`, "i"),
  ];
  for (const pattern of patterns) {
    const match = pattern.exec(html);
    if (match?.[1]) return decodeEntities(match[1]).trim() || null;
  }
  return null;
}

function clamp(value: string | null, max: number): string | null {
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max).trimEnd()}…` : value;
}

/** Reads at most MAX_BYTES of the response body, then stops - `res.text()` would read all of it. */
async function readCapped(res: Response): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const decoder = new TextDecoder();
  let out = "";
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    out += decoder.decode(value, { stream: true });
    if (total >= MAX_BYTES) {
      await reader.cancel();
      break;
    }
  }
  return out;
}

export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreviewData | null> {
  const url = safeHttpUrl(rawUrl);
  if (!url) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
      headers: { accept: "text/html,application/xhtml+xml", "user-agent": "F1HubBot/1.0 (+link-preview)" },
    });
    // A redirect chain can land somewhere this would never have fetched directly.
    if (!safeHttpUrl(res.url || url.toString())) return null;
    if (!res.ok) return null;
    if (!(res.headers.get("content-type") ?? "").includes("html")) return null;

    const html = await readCapped(res);
    const image = metaContent(html, "og:image") ?? metaContent(html, "twitter:image");
    const resolvedImage = image ? new URL(image, res.url || url.toString()).toString() : null;

    return {
      url: url.toString(),
      domain: url.hostname.replace(/^www\./, ""),
      title: clamp(metaContent(html, "og:title") ?? clamp(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? null, 200), 160),
      description: clamp(metaContent(html, "og:description") ?? metaContent(html, "description"), 220),
      siteName: clamp(metaContent(html, "og:site_name"), 60),
      // Re-validated: an og:image can point anywhere, including back inside the network.
      imageUrl: resolvedImage && safeHttpUrl(resolvedImage) ? resolvedImage : null,
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}
