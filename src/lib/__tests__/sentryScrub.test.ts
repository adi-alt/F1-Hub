import { describe, it } from "node:test";
import assert from "node:assert/strict";
import type { ErrorEvent } from "@sentry/nextjs";
import { scrubEvent, sentryOptions } from "../observability/sentryOptions";
import { hashUserId } from "../ai/telemetry";

describe("Sentry events carry no personal data (audit R-13)", () => {
  it("drops cookies, auth headers, the user, and email addresses in messages", () => {
    const event = {
      type: undefined,
      message: "OTP failed for someone@example.com",
      user: { id: "u1", email: "someone@example.com" },
      request: { cookies: { f1hub_session: "x" }, headers: { cookie: "a=b", Authorization: "Bearer t", "x-cron-secret": "s", "user-agent": "ua" } },
      exception: { values: [{ type: "Error", value: "no account for a.b+c@mail.co.uk" }] },
    } as unknown as ErrorEvent;
    const out = scrubEvent(event);
    assert.equal(out.message, "OTP failed for <email>");
    assert.equal(out.user, undefined);
    assert.equal(out.request?.cookies, undefined);
    assert.deepEqual(out.request?.headers, { "user-agent": "ua" });
    assert.equal(out.exception?.values?.[0].value, "no account for <email>");
  });

  it("stays off without a DSN, and never sends default PII or traces", () => {
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
    const off = sentryOptions();
    assert.equal(off.enabled, false);
    assert.equal(off.sendDefaultPii, false);
    assert.equal(off.tracesSampleRate, 0);
    process.env.NEXT_PUBLIC_SENTRY_DSN = "https://k@o1.ingest.de.sentry.io/2";
    assert.equal(sentryOptions().enabled, true);
    delete process.env.NEXT_PUBLIC_SENTRY_DSN;
  });
});

describe("hashUserId", () => {
  it("is stable, short, and not the id", () => {
    process.env.SESSION_SECRET = "test-secret";
    const a = hashUserId("00000000-0000-4000-8000-0000000a1100");
    assert.equal(a, hashUserId("00000000-0000-4000-8000-0000000a1100"));
    assert.match(a ?? "", /^[0-9a-f]{12}$/);
    assert.notEqual(a, hashUserId("00000000-0000-4000-8000-0000000a1101"));
    assert.equal(hashUserId(null), null);
  });
});
