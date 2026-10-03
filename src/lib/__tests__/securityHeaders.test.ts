import { it } from "node:test";
import assert from "node:assert/strict";
import nextConfig, { SECURITY_HEADERS } from "../../../next.config";

it("every route sends the security headers (audit SEC-23)", async () => {
  const rules = await nextConfig.headers!();
  assert.deepEqual(rules, [{ source: "/:path*", headers: SECURITY_HEADERS }]);
  const byName = Object.fromEntries(SECURITY_HEADERS.map((h) => [h.key.toLowerCase(), h.value]));
  assert.equal(byName["content-security-policy"], "frame-ancestors 'none'");
  assert.equal(byName["x-frame-options"], "DENY");
  assert.equal(byName["x-content-type-options"], "nosniff");
  assert.equal(byName["referrer-policy"], "strict-origin-when-cross-origin");
  assert.ok(!/clipboard/.test(byName["permissions-policy"]), "sharing and export use the clipboard");
});
