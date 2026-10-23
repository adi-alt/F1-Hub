import { test } from "node:test";
import assert from "node:assert/strict";
import { MAX_EMAIL_ATTEMPTS, emailErrorText, nextEmailAttempt } from "../emailRetry";

const now = new Date("2026-10-23T10:00:00Z");
const hoursLater = (d: Date | null) => (d ? (d.getTime() - now.getTime()) / 3_600_000 : null);

test("backs off 1h, 2h, 4h, 8h, then stops", () => {
  assert.deepEqual([1, 2, 3, 4].map((n) => hoursLater(nextEmailAttempt(n, now))), [1, 2, 4, 8]);
  assert.equal(nextEmailAttempt(MAX_EMAIL_ATTEMPTS, now), null);
  assert.equal(nextEmailAttempt(MAX_EMAIL_ATTEMPTS + 3, now), null);
});

test("error text is one bounded line", () => {
  assert.equal(emailErrorText(new Error("550\n  mailbox   unavailable")), "550 mailbox unavailable");
  assert.equal(emailErrorText("x".repeat(5000)).length, 1000);
  assert.equal(emailErrorText(""), "Unknown error");
});
