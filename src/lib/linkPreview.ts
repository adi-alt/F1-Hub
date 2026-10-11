/**
 * Open Graph metadata for a pasted URL: the checks and the parsing. The fetch itself is in
 * linkPreview.server.ts, because this module is also imported by the client (PostContent's
 * linkifier uses safeHttpUrl), and the fetch needs node:dns and node:https.
 *
 * Fetching a URL a user supplied is a server-side request to an address they control, so that is
 * written defensively rather than conveniently: only http/https, never a private, loopback or
 * otherwise internal address (an SSRF into the deployment's own network) checked on the address
 * the connection actually uses, every redirect checked like the first URL, a hard timeout, and a
 * capped read. Everything extracted is treated as untrusted text - it is rendered as text, never as
 * markup, and the image URL is re-validated before it is ever put in a src.
 */

export type LinkPreviewData = {
  url: string;
  domain: string;
  title: string | null;
  description: string | null;
  siteName: string | null;
  imageUrl: string | null;
};

/** IPv4 ranges that aren't the public internet (RFC 6890 and friends): private, loopback,
 * link-local (incl. cloud metadata), CGNAT, documentation, benchmarking, multicast, reserved. */
const BLOCKED_V4: [number, number][] = [
  ["0.0.0.0", 8],
  ["10.0.0.0", 8],
  ["100.64.0.0", 10],
  ["127.0.0.0", 8],
  ["169.254.0.0", 16],
  ["172.16.0.0", 12],
  ["192.0.0.0", 24],
  ["192.0.2.0", 24],
  ["192.88.99.0", 24],
  ["192.168.0.0", 16],
  ["198.18.0.0", 15],
  ["198.51.100.0", 24],
  ["203.0.113.0", 24],
  ["224.0.0.0", 4],
  ["240.0.0.0", 4],
].map(([base, bits]) => [parseIPv4(base as string)!, bits as number]);

function parseIPv4(address: string): number | null {
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(address);
  if (!parts) return null;
  const octets = parts.slice(1).map(Number);
  if (octets.some((o) => o > 255)) return null;
  return ((octets[0] << 24) | (octets[1] << 16) | (octets[2] << 8) | octets[3]) >>> 0;
}

function isBlockedV4(value: number): boolean {
  return BLOCKED_V4.some(([base, bits]) => (bits === 0 ? true : value >>> (32 - bits) === base >>> (32 - bits)));
}

/** Eight 16-bit groups, or null. Handles `::` and a dotted IPv4 tail (`::ffff:1.2.3.4`); drops a
 * zone id (`fe80::1%eth0`). */
function parseIPv6(address: string): number[] | null {
  let text = address.toLowerCase().replace(/^\[|\]$/g, "");
  const zone = text.indexOf("%");
  if (zone !== -1) text = text.slice(0, zone);
  const lastColon = text.lastIndexOf(":");
  if (lastColon === -1) return null;
  const tail = text.slice(lastColon + 1);
  if (tail.includes(".")) {
    const v4 = parseIPv4(tail);
    if (v4 === null) return null;
    text = `${text.slice(0, lastColon + 1)}${(v4 >>> 16).toString(16)}:${(v4 & 0xffff).toString(16)}`;
  }
  const halves = text.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 2 ? missing < 1 : missing !== 0) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? missing : 0).fill("0"), ...rest];
  if (!groups.every((g) => /^[0-9a-f]{1,4}$/.test(g))) return null;
  return groups.map((g) => parseInt(g, 16));
}

function isBlockedV6(g: number[]): boolean {
  const embeddedV4 = (hi: number, lo: number) => ((hi << 16) | lo) >>> 0;
  const zeroUpTo = (n: number) => g.slice(0, n).every((x) => x === 0);
  if (zeroUpTo(8)) return true; // :: unspecified
  if (zeroUpTo(7) && g[7] === 1) return true; // ::1 loopback
  // An IPv4 address in IPv6 clothing is as internal as the IPv4 address it carries: mapped
  // (::ffff:0:0/96), IPv4-compatible (::/96), NAT64 (64:ff9b::/96) and 6to4 (2002::/16).
  if (zeroUpTo(5) && g[5] === 0xffff) return isBlockedV4(embeddedV4(g[6], g[7]));
  if (zeroUpTo(6)) return isBlockedV4(embeddedV4(g[6], g[7]));
  if (g[0] === 0x64 && g[1] === 0xff9b && g.slice(2, 6).every((x) => x === 0)) return isBlockedV4(embeddedV4(g[6], g[7]));
  if (g[0] === 0x2002) return isBlockedV4(embeddedV4(g[1], g[2]));
  if (g[0] === 0x64 && g[1] === 0xff9b && g[2] === 1) return true; // local-use NAT64 (64:ff9b:1::/48)
  if (g[0] === 0x100 && g[1] === 0 && g[2] === 0 && g[3] === 0) return true; // discard-only (100::/64)
  if (g[0] === 0x2001 && g[1] === 0) return true; // Teredo (2001::/32), tunnels to arbitrary IPv4
  if (g[0] === 0x2001 && g[1] === 0xdb8) return true; // documentation (2001:db8::/32)
  if ((g[0] & 0xfe00) === 0xfc00) return true; // unique local (fc00::/7)
  if ((g[0] & 0xffc0) === 0xfe80 || (g[0] & 0xffc0) === 0xfec0) return true; // link-local, old site-local
  if ((g[0] & 0xff00) === 0xff00) return true; // multicast
  return false;
}

/** Whether an IP address (v4 or v6, as a URL hostname or as DNS returns it) is anything but the
 * public internet. Not an address at all is false: hostnames are judged by what they resolve to. */
export function isBlockedAddress(address: string): boolean {
  const v4 = parseIPv4(address);
  if (v4 !== null) return isBlockedV4(v4);
  const v6 = address.includes(":") ? parseIPv6(address) : null;
  return v6 !== null && isBlockedV6(v6);
}

/** Hostnames refused before any lookup: the internal names, and every IP literal that isn't public.
 * An IP literal never reaches a DNS lookup, so this is the only check it gets. A public-looking
 * name is checked again on the address it resolves to (linkPreview.server.ts), which is what stops
 * a name like 127.0.0.1.nip.io (audit SEC-10). A name merely starting with "fc" or "fd" (an IPv6
 * prefix) is an ordinary name: fcbarcelona.com used to be refused. */
function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal") || host.endsWith(".local")) return true;
  if (parseIPv4(host) !== null || host.includes(":")) return isBlockedAddress(host) || (host.includes(":") && parseIPv6(host) === null);
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

/** The preview fields from a page's HTML. `finalUrl` is where the page was actually served from
 * (after redirects), which relative image URLs resolve against; `requestedUrl` is what the post
 * linked to, which the card shows. */
export function parsePreviewHtml(html: string, finalUrl: URL, requestedUrl: URL): LinkPreviewData {
  const image = metaContent(html, "og:image") ?? metaContent(html, "twitter:image");
  let resolvedImage: string | null = null;
  try {
    resolvedImage = image ? new URL(image, finalUrl).toString() : null;
  } catch {
    resolvedImage = null;
  }
  return {
    url: requestedUrl.toString(),
    domain: requestedUrl.hostname.replace(/^www\./, ""),
    title: clamp(metaContent(html, "og:title") ?? clamp(/<title[^>]*>([^<]*)<\/title>/i.exec(html)?.[1]?.trim() ?? null, 200), 160),
    description: clamp(metaContent(html, "og:description") ?? metaContent(html, "description"), 220),
    siteName: clamp(metaContent(html, "og:site_name"), 60),
    // Re-validated: an og:image can point anywhere, including back inside the network.
    imageUrl: resolvedImage && safeHttpUrl(resolvedImage) ? resolvedImage : null,
  };
}
