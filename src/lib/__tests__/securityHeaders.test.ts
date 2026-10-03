import { it } from "node:test";
import assert from "node:assert/strict";
import nextConfig, { SECURITY_HEADERS, cspReportOnly } from "../../../next.config";

it("every route sends the security headers (audit SEC-23)", async () => {
  const rules = await nextConfig.headers!();
  assert.equal(rules.length, 1);
  assert.equal(rules[0].source, "/:path*");
  assert.deepEqual(rules[0].headers.slice(0, SECURITY_HEADERS.length), SECURITY_HEADERS);
  assert.ok(rules[0].headers.some((h) => h.key === "Content-Security-Policy-Report-Only"), "the report-only policy is sent");
  const byName = Object.fromEntries(SECURITY_HEADERS.map((h) => [h.key.toLowerCase(), h.value]));
  assert.equal(byName["content-security-policy"], "frame-ancestors 'none'");
  assert.equal(byName["x-frame-options"], "DENY");
  assert.equal(byName["x-content-type-options"], "nosniff");
  assert.equal(byName["referrer-policy"], "strict-origin-when-cross-origin");
  assert.ok(!/clipboard/.test(byName["permissions-policy"]), "sharing and export use the clipboard");
});

it("the report-only CSP blocks nothing, names its sources, and reports to Sentry when there is a DSN", () => {
  const csp = cspReportOnly("https://abc123@o1.ingest.de.sentry.io/4242");
  for (const directive of ["default-src 'self'", "object-src 'none'", "frame-ancestors 'none'", "base-uri 'self'", "https://*.supabase.co", "wss://*.supabase.co", "https://*.ingest.de.sentry.io"]) {
    assert.ok(csp.includes(directive), directive);
  }
  assert.ok(csp.endsWith("report-uri https://o1.ingest.de.sentry.io/api/4242/security/?sentry_key=abc123"));
  assert.ok(!cspReportOnly(undefined).includes("report-uri"));
  assert.ok(!cspReportOnly("not a url").includes("report-uri"));
});
