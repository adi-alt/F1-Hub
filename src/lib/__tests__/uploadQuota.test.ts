import { test } from "node:test";
import assert from "node:assert/strict";
import { POST_MEDIA_QUOTA_BYTES, quotaError } from "../uploadQuota";

const MB = 1024 * 1024;

test("fits up to the quota exactly", () => {
  assert.equal(quotaError(0, 2 * MB), null);
  assert.equal(quotaError(POST_MEDIA_QUOTA_BYTES - 2 * MB, 2 * MB), null);
});

test("refuses past the quota with a clear message", () => {
  assert.equal(quotaError(99 * MB, 2 * MB), "You've used 99MB of your 100MB upload space, and this file needs 2MB (1MB left). Try a smaller file, or post a link instead.");
  assert.match(quotaError(100 * MB, 1024) ?? "", /used 100MB of your 100MB upload space, and this file needs 1KB\. Try/);
});
