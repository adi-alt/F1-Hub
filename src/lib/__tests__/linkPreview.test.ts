import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { firstUrlIn, safeHttpUrl } from "../linkPreview";

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
