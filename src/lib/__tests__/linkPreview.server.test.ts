// The link-preview fetch against a real HTTP server (audit SEC-10). The server listens on loopback,
// which the real guard refuses, so the tests pass a guard that lets exactly that one address
// through and judges every other address by the real rules - names are mapped by a fake resolver,
// never real DNS.

import { after, before, describe, it } from "node:test";
import assert from "node:assert/strict";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import type { LookupAddress } from "node:dns";
import { gzipSync } from "node:zlib";
import { isBlockedAddress } from "../linkPreview";
import { fetchLinkPreview, fetchPreviewWith, guardedLookupWith } from "../linkPreview.server";

const PAGE = (title: string) => `<html><head><meta property="og:title" content="${title}"><meta property="og:image" content="/pole.jpg"></head><body></body></html>`;

let server: Server;
let port = 0;
const hits: string[] = [];

before(async () => {
  server = createServer((req, res) => {
    hits.push(`${req.headers.host}${req.url}`);
    const at = (path: string) => req.url === path;
    if (at("/article")) {
      res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
      return res.end(PAGE("Norris on pole"));
    }
    if (at("/gzip")) {
      res.writeHead(200, { "content-type": "text/html", "content-encoding": "gzip" });
      return res.end(gzipSync(PAGE("Compressed")));
    }
    if (at("/huge")) {
      res.writeHead(200, { "content-type": "text/html" });
      return res.end(PAGE("Big page") + "x".repeat(2_000_000));
    }
    if (at("/json")) {
      res.writeHead(200, { "content-type": "application/json" });
      return res.end("{}");
    }
    if (at("/to-article")) return redirect(res, `http://news.test:${port}/article`);
    if (at("/to-internal-name")) return redirect(res, `http://internal.test:${port}/article`);
    if (at("/to-loopback-literal")) return redirect(res, `http://127.0.0.1:${port}/article`);
    if (at("/to-metadata")) return redirect(res, "http://169.254.169.254/latest/meta-data/");
    if (at("/to-file")) return redirect(res, "file:///etc/passwd");
    const loop = /^\/hop\/(\d+)$/.exec(req.url ?? "");
    if (loop) return redirect(res, `http://news.test:${port}/hop/${Number(loop[1]) + 1}`);
    res.writeHead(404).end();
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  port = (server.address() as AddressInfo).port;
});

after(() => server.close());

function redirect(res: import("node:http").ServerResponse, location: string) {
  res.writeHead(302, { location });
  res.end();
}

const NAMES: Record<string, LookupAddress[]> = {
  "news.test": [{ address: "127.0.0.1", family: 4 }],
  "internal.test": [{ address: "10.0.0.7", family: 4 }],
  "rebind.test": [
    { address: "93.184.216.34", family: 4 },
    { address: "127.0.0.1", family: 4 },
  ],
  "public.test": [{ address: "93.184.216.34", family: 4 }],
};

const fakeResolve = (hostname: string, _options: unknown, callback: (err: NodeJS.ErrnoException | null, addresses: LookupAddress[]) => void) => {
  const found = NAMES[hostname];
  if (found) callback(null, found);
  else callback(Object.assign(new Error(`ENOTFOUND ${hostname}`), { code: "ENOTFOUND" }), []);
};

/** The real rules, except the test server's own loopback address. */
const testLookup = guardedLookupWith(fakeResolve, (address) => address !== "127.0.0.1" && isBlockedAddress(address));
const at = (path: string) => new URL(`http://news.test:${port}${path}`);

describe("guardedLookupWith", () => {
  const lookup = guardedLookupWith(fakeResolve);
  const run = (hostname: string, all: boolean) =>
    new Promise<{ err: NodeJS.ErrnoException | null; address: unknown; family?: number }>((resolve) =>
      lookup(hostname, { all }, (err, address, family) => resolve({ err, address, family })),
    );

  it("hands over a name's addresses when every one is public", async () => {
    const one = await run("public.test", false);
    assert.equal(one.err, null);
    assert.equal(one.address, "93.184.216.34");
    assert.equal(one.family, 4);
    const all = await run("public.test", true);
    assert.deepEqual(all.address, [{ address: "93.184.216.34", family: 4 }]);
  });

  it("refuses a name that resolves inside the network", async () => {
    assert.equal((await run("internal.test", false)).err?.code, "EBLOCKEDADDRESS");
    assert.equal((await run("news.test", true)).err?.code, "EBLOCKEDADDRESS", "loopback, with the real rules");
  });

  it("refuses a name with any internal address, even beside a public one (a rebinding setup)", async () => {
    assert.equal((await run("rebind.test", true)).err?.code, "EBLOCKEDADDRESS");
  });

  it("passes DNS errors through", async () => {
    assert.equal((await run("nowhere.test", false)).err?.code, "ENOTFOUND");
  });
});

describe("fetchPreviewWith", () => {
  it("reads a page's preview", async () => {
    const preview = await fetchPreviewWith(at("/article"), testLookup);
    assert.equal(preview?.title, "Norris on pole");
    assert.equal(preview?.imageUrl, `http://news.test:${port}/pole.jpg`);
  });

  it("follows a redirect, keeping the posted URL on the card", async () => {
    const preview = await fetchPreviewWith(at("/to-article"), testLookup);
    assert.equal(preview?.title, "Norris on pole");
    assert.equal(preview?.url, `http://news.test:${port}/to-article`);
  });

  it("checks every redirect hop like the first URL", async () => {
    hits.length = 0;
    assert.equal(await fetchPreviewWith(at("/to-internal-name"), testLookup), null, "a name that resolves inside");
    assert.equal(await fetchPreviewWith(at("/to-loopback-literal"), testLookup), null, "an internal literal never reaches a lookup");
    assert.equal(await fetchPreviewWith(at("/to-metadata"), testLookup), null, "the cloud metadata address");
    assert.equal(await fetchPreviewWith(at("/to-file"), testLookup), null, "a non-http scheme");
    assert.ok(!hits.some((h) => h.includes("/article")), "none of them reached the target");
  });

  it("gives up after three redirects", async () => {
    hits.length = 0;
    assert.equal(await fetchPreviewWith(at("/hop/0"), testLookup), null);
    assert.equal(hits.length, 4, "the first request and three redirects, no more");
  });

  it("decompresses gzip and stops reading a huge page after the head", async () => {
    assert.equal((await fetchPreviewWith(at("/gzip"), testLookup))?.title, "Compressed");
    assert.equal((await fetchPreviewWith(at("/huge"), testLookup))?.title, "Big page");
  });

  it("has no preview for anything that isn't an HTML page", async () => {
    assert.equal(await fetchPreviewWith(at("/json"), testLookup), null);
    assert.equal(await fetchPreviewWith(at("/missing"), testLookup), null);
  });
});

describe("fetchLinkPreview", () => {
  it("refuses internal and non-http URLs before any request", async () => {
    hits.length = 0;
    assert.equal(await fetchLinkPreview(`http://127.0.0.1:${port}/article`), null);
    assert.equal(await fetchLinkPreview(`http://[::ffff:7f00:1]:${port}/article`), null);
    assert.equal(await fetchLinkPreview("javascript:alert(1)"), null);
    assert.equal(hits.length, 0);
  });
});
