import dns, { type LookupAddress, type LookupOptions } from "node:dns";
import http, { type IncomingMessage } from "node:http";
import https from "node:https";
import type { LookupFunction } from "node:net";
import { pipeline, type Readable } from "node:stream";
import zlib from "node:zlib";
import { isBlockedAddress, parsePreviewHtml, safeHttpUrl, type LinkPreviewData } from "./linkPreview";

// The fetch behind link previews (see linkPreview.ts for the checks and the parsing). Server only:
// it needs node:dns and node:https, which is why it isn't in linkPreview.ts, which the client also
// imports.

const FETCH_TIMEOUT_MS = 4000;
/** Metadata lives in <head>; 256KB is far more than enough to reach the end of one, and stops a
 * large page from being read in full for four tags. Counted after decompression, so a small
 * compressed body that inflates to gigabytes stops here too. */
const MAX_BYTES = 256 * 1024;
const MAX_REDIRECTS = 3;

type Resolve = (hostname: string, options: dns.LookupAllOptions, callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => void;

/**
 * A DNS lookup for the HTTP client that refuses to hand it an internal address (audit SEC-10).
 * The check runs on the very addresses the connection is about to use, so there is no gap between
 * checking a name and connecting to it for DNS rebinding to slip into, and a public-looking name
 * that resolves inside the network (127.0.0.1.nip.io, a name pointed at the cloud metadata
 * address) fails here. A name with ANY internal address is refused, even with public ones beside
 * it: that mix is a rebinding setup, not a real website.
 *
 * `isBlocked` exists for the tests, which have to serve from loopback; nothing else passes it.
 */
export function guardedLookupWith(resolve: Resolve, isBlocked: (address: string) => boolean = isBlockedAddress): LookupFunction {
  return (hostname: string, options: LookupOptions, callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void) => {
    resolve(hostname, { ...options, all: true }, (err, addresses) => {
      if (err) return callback(err, "");
      if (addresses.length === 0 || addresses.some((a) => isBlocked(a.address))) {
        const blocked: NodeJS.ErrnoException = new Error(`${hostname} resolves to an address link previews don't fetch`);
        blocked.code = "EBLOCKEDADDRESS";
        return callback(blocked, "");
      }
      if (options.all) return callback(null, addresses);
      callback(null, addresses[0].address, addresses[0].family);
    });
  };
}

const guardedLookup = guardedLookupWith(dns.lookup as unknown as Resolve);

function get(url: URL, lookup: LookupFunction, signal: AbortSignal): Promise<IncomingMessage> {
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(
      url,
      {
        method: "GET",
        lookup,
        signal,
        headers: {
          accept: "text/html,application/xhtml+xml",
          "accept-encoding": "gzip, deflate, br",
          "user-agent": "F1HubBot/1.0 (+link-preview)",
        },
      },
      resolve,
    );
    request.on("error", reject);
    request.end();
  });
}

/** The body, decompressed. pipeline() rather than pipe(), so an error on either side ends both. */
function bodyOf(res: IncomingMessage): Readable {
  const encoding = (res.headers["content-encoding"] ?? "").trim().toLowerCase();
  const inflate = encoding === "gzip" || encoding === "x-gzip" ? zlib.createGunzip() : encoding === "deflate" ? zlib.createInflate() : encoding === "br" ? zlib.createBrotliDecompress() : null;
  return inflate ? pipeline(res, inflate, () => {}) : res;
}

/** Reads at most MAX_BYTES of the body, then stops; leaving the loop early destroys the stream. */
async function readCapped(body: Readable): Promise<string> {
  const decoder = new TextDecoder();
  let out = "";
  let total = 0;
  for await (const chunk of body) {
    const bytes = chunk as Buffer;
    total += bytes.byteLength;
    out += decoder.decode(bytes, { stream: true });
    if (total >= MAX_BYTES) break;
  }
  return out;
}

/**
 * The fetch, from an already-checked URL, with the lookup supplied: fetchLinkPreview passes the
 * guarded one, and the tests a guarded one that also lets their loopback server through.
 * Redirects are followed by hand, up to MAX_REDIRECTS, and every hop is checked exactly like the
 * first URL: `redirect: "follow"` used to fetch the whole chain and only look at where it ended.
 * One deadline covers every hop and the body.
 */
export async function fetchPreviewWith(start: URL, lookup: LookupFunction): Promise<LinkPreviewData | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    let url = start;
    for (let hop = 0; ; hop++) {
      const res = await get(url, lookup, controller.signal);
      const status = res.statusCode ?? 0;
      const location = res.headers.location;
      if (status >= 300 && status < 400 && location) {
        res.resume();
        let next: URL | null = null;
        try {
          next = hop < MAX_REDIRECTS ? safeHttpUrl(new URL(location, url).toString()) : null;
        } catch {
          next = null;
        }
        if (!next) return null;
        url = next;
        continue;
      }
      if (status < 200 || status >= 300 || !(res.headers["content-type"] ?? "").includes("html")) {
        res.resume();
        return null;
      }
      return parsePreviewHtml(await readCapped(bodyOf(res)), url, start);
    }
  } catch {
    // Refused, unreachable, timed out, malformed: all just "no preview".
    return null;
  } finally {
    clearTimeout(timer);
  }
}

export async function fetchLinkPreview(rawUrl: string): Promise<LinkPreviewData | null> {
  const url = safeHttpUrl(rawUrl);
  return url ? fetchPreviewWith(url, guardedLookup) : null;
}
