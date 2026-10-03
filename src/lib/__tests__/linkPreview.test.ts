import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { firstUrlIn, isBlockedAddress, parsePreviewHtml, safeHttpUrl } from "../linkPreview";

// safeHttpUrl is the single gate between user-supplied text and both a server-side fetch and a
// rendered href, so these are the cases that actually matter for it - not its happy path.
describe("safeHttpUrl", () => {
  it("accepts ordinary http and https URLs", () => {
    assert.ok(safeHttpUrl("https://example.com/article"));
    assert.ok(safeHttpUrl("http://example.com"));
  });

  it("refuses non-http schemes, which is what stops a pasted link becoming an injection", () => {
    assert.equal(safeHttpUrl("javascript:alert(1)"), null);
    assert.equal(safeHttpUrl("data:text/html,<script>alert(1)</script>"), null);
    assert.equal(safeHttpUrl("file:///etc/passwd"), null);
    assert.equal(safeHttpUrl("JavaScript:alert(1)"), null);
  });

  it("refuses loopback and private addresses, so a preview can't be pointed inside the network", () => {
    for (const url of [
      "http://localhost/admin",
      "http://127.0.0.1/",
      "http://10.1.2.3/",
      "http://192.168.0.1/",
      "http://172.16.5.4/",
      "http://172.31.255.255/",
      "http://[::1]/",
      "http://service.internal/",
    ]) {
      assert.equal(safeHttpUrl(url), null, `${url} should be refused`);
    }
  });

  it("refuses the cloud metadata endpoint specifically", () => {
    assert.equal(safeHttpUrl("http://169.254.169.254/latest/meta-data/"), null);
  });

  it("still allows public addresses that merely look similar", () => {
    assert.ok(safeHttpUrl("http://172.32.0.1/"), "172.32 is outside the private range");
    assert.ok(safeHttpUrl("http://11.0.0.1/"), "11.x is public");
  });

  it("refuses text that isn't a URL at all", () => {
    assert.equal(safeHttpUrl("not a url"), null);
    assert.equal(safeHttpUrl(""), null);
  });
});

describe("firstUrlIn", () => {
  it("finds the first URL in a block of text", () => {
    assert.equal(firstUrlIn("look at https://example.com/a and https://example.com/b"), "https://example.com/a");
  });

  it("drops trailing sentence punctuation rather than fetching it as part of the URL", () => {
    assert.equal(firstUrlIn("see https://example.com/a."), "https://example.com/a");
    assert.equal(firstUrlIn("see (https://example.com/a)"), "https://example.com/a");
  });

  it("returns null when there is no link", () => {
    assert.equal(firstUrlIn("no links here at all"), null);
  });
});

describe("isBlockedAddress (audit SEC-10)", () => {
  it("blocks every IPv4 range that isn't the public internet", () => {
    for (const ip of [
      "0.0.0.0",
      "10.20.30.40",
      "100.64.0.1", // CGNAT
      "100.127.255.254",
      "127.0.0.1",
      "127.255.0.9",
      "169.254.169.254", // cloud metadata
      "172.16.0.1",
      "172.31.255.255",
      "192.0.0.8",
      "192.0.2.1",
      "192.168.1.1",
      "198.18.0.1",
      "198.19.255.255",
      "198.51.100.7",
      "203.0.113.9",
      "224.0.0.251",
      "239.255.255.250",
      "240.0.0.1",
      "255.255.255.255",
    ]) {
      assert.equal(isBlockedAddress(ip), true, ip);
    }
  });

  it("blocks internal IPv6, and IPv4 addresses wrapped in IPv6", () => {
    for (const ip of [
      "::",
      "::1",
      "::ffff:127.0.0.1",
      "::ffff:7f00:1", // the same, as a URL writes it
      "::ffff:a9fe:a9fe", // 169.254.169.254
      "::127.0.0.1", // IPv4-compatible
      "64:ff9b::7f00:1", // NAT64 of 127.0.0.1
      "64:ff9b:1::5",
      "2002:7f00:1::", // 6to4 of 127.0.0.1
      "2001:0:4136:e378:8000:63bf:3fff:fdd2", // Teredo
      "2001:db8::1",
      "100::1",
      "fc00::1",
      "fd12:3456::1",
      "fe80::1",
      "fe80::1%eth0",
      "fec0::1",
      "ff02::1",
    ]) {
      assert.equal(isBlockedAddress(ip), true, ip);
    }
  });

  it("allows public addresses, including ones next to the blocked ranges", () => {
    for (const ip of ["8.8.8.8", "1.1.1.1", "100.63.255.255", "100.128.0.1", "172.32.0.1", "198.20.0.1", "223.255.255.255", "2606:4700:4700::1111", "2a00:1450:4009:81f::200e", "::ffff:8.8.8.8", "64:ff9b::808:808", "2002:808:808::"]) {
      assert.equal(isBlockedAddress(ip), false, ip);
    }
  });

  it("is false for things that aren't addresses (names are judged by what they resolve to)", () => {
    assert.equal(isBlockedAddress("example.com"), false);
    assert.equal(isBlockedAddress("999.1.1.1"), false);
  });
});

describe("safeHttpUrl, the SEC-10 cases", () => {
  it("refuses IPv6 literals inside the network, and IPv4 written the other ways a URL allows", () => {
    for (const url of ["http://[fd00::1]/", "http://[fe80::1]/", "http://[::ffff:127.0.0.1]/", "http://[::ffff:169.254.169.254]/latest/", "http://100.64.0.1/", "http://0x7f000001/", "http://2130706433/", "http://127.1/", "http://[::]/"]) {
      assert.equal(safeHttpUrl(url), null, url);
    }
  });

  it("no longer refuses ordinary names that start with fc or fd", () => {
    assert.ok(safeHttpUrl("https://www.fcbarcelona.com/en/"));
    assert.ok(safeHttpUrl("https://fdroid.org/"));
  });
});

describe("parsePreviewHtml", () => {
  const page = new URL("https://news.example/2026/story");
  const html = `<html><head><title>Fallback</title>
    <meta property="og:title" content="Norris on pole &amp; Piastri second">
    <meta content="Qualifying report" name="description">
    <meta property="og:site_name" content="Example News">
    <meta property="og:image" content="/img/pole.jpg"></head></html>`;

  it("reads the Open Graph fields, resolving a relative image against the page it came from", () => {
    const preview = parsePreviewHtml(html, page, new URL("https://example.short/abc"));
    assert.equal(preview.title, "Norris on pole & Piastri second");
    assert.equal(preview.description, "Qualifying report");
    assert.equal(preview.siteName, "Example News");
    assert.equal(preview.imageUrl, "https://news.example/img/pole.jpg");
    assert.equal(preview.url, "https://example.short/abc", "the card links to what was posted");
    assert.equal(preview.domain, "example.short");
  });

  it("drops an image that points inside the network", () => {
    const inside = html.replace("/img/pole.jpg", "http://169.254.169.254/latest/meta-data/");
    assert.equal(parsePreviewHtml(inside, page, page).imageUrl, null);
  });
});
