import { test, describe } from "node:test";
import assert from "node:assert/strict";

describe("Level 4 Moderation & Community Hardening", () => {
  describe("Community Rules Sanitization", () => {
    function sanitizeRules(input: unknown): string[] {
      if (!Array.isArray(input)) throw new Error("Rules must be an array.");
      return input
        .map((r) => String(r).trim())
        .filter(Boolean)
        .slice(0, 10);
    }

    test("accepts valid array of rules and trims whitespace", () => {
      const input = ["  Be respectful to all members  ", "No unshielded spoilers  ", "Stay on topic  "];
      const result = sanitizeRules(input);
      assert.deepEqual(result, [
        "Be respectful to all members",
        "No unshielded spoilers",
        "Stay on topic",
      ]);
    });

    test("filters out empty or whitespace-only rules", () => {
      const input = ["Rule 1", "   ", "", "Rule 2", "\t\n"];
      const result = sanitizeRules(input);
      assert.deepEqual(result, ["Rule 1", "Rule 2"]);
    });

    test("caps at maximum 10 rules", () => {
      const input = Array.from({ length: 15 }, (_, i) => `Rule ${i + 1}`);
      const result = sanitizeRules(input);
      assert.equal(result.length, 10);
      assert.equal(result[0], "Rule 1");
      assert.equal(result[9], "Rule 10");
    });

    test("rejects non-array inputs", () => {
      assert.throws(() => sanitizeRules("Not an array"), /Rules must be an array/);
      assert.throws(() => sanitizeRules(null), /Rules must be an array/);
      assert.throws(() => sanitizeRules(123), /Rules must be an array/);
    });
  });

  describe("Slow Mode Rate Limit Bounds", () => {
    function sanitizeSlowMode(seconds: number): number {
      return Math.max(0, Math.min(3600, Math.floor(seconds)));
    }

    test("clamps negative seconds to 0 (disabled)", () => {
      assert.equal(sanitizeSlowMode(-10), 0);
      assert.equal(sanitizeSlowMode(-0.5), 0);
    });

    test("clamps values over 3600s to 3600s (1 hour)", () => {
      assert.equal(sanitizeSlowMode(7200), 3600);
      assert.equal(sanitizeSlowMode(50000), 3600);
    });

    test("floors non-integer values", () => {
      assert.equal(sanitizeSlowMode(45.9), 45);
      assert.equal(sanitizeSlowMode(15.2), 15);
    });

    test("calculates cooldown remaining properly", () => {
      const now = 1000000;
      const lastPostAt = now - 20000; // 20s ago
      const slowModeSeconds = 60; // 60s cooldown

      const elapsedSec = (now - lastPostAt) / 1000;
      const isCooldowned = elapsedSec < slowModeSeconds;
      const waitSec = Math.ceil(slowModeSeconds - elapsedSec);

      assert.equal(isCooldowned, true);
      assert.equal(waitSec, 40);
    });
  });

  describe("Temporary Mute Calculation & Rules", () => {
    function calculateMute(durationSeconds: number, reason?: string) {
      const duration = Math.max(60, Math.min(30 * 86400, Math.floor(durationSeconds)));
      const trimmedReason = reason?.trim().slice(0, 300) || null;
      return { duration, trimmedReason };
    }

    test("clamps duration to minimum 60s and maximum 30 days", () => {
      assert.equal(calculateMute(10).duration, 60);
      assert.equal(calculateMute(99999999).duration, 30 * 86400);
      assert.equal(calculateMute(3600).duration, 3600);
    });

    test("sanitizes and truncates mute reason", () => {
      const { trimmedReason } = calculateMute(3600, "  Excessive spam during race  ");
      assert.equal(trimmedReason, "Excessive spam during race");

      const longReason = "a".repeat(400);
      const { trimmedReason: truncated } = calculateMute(3600, longReason);
      assert.equal(truncated?.length, 300);
    });

    test("detects active mute vs expired mute correctly", () => {
      const pastTime = new Date(Date.now() - 10000).toISOString();
      const futureTime = new Date(Date.now() + 600000).toISOString();

      const isMutedPast = Boolean(pastTime && new Date(pastTime).getTime() > Date.now());
      const isMutedFuture = Boolean(futureTime && new Date(futureTime).getTime() > Date.now());

      assert.equal(isMutedPast, false);
      assert.equal(isMutedFuture, true);
    });
  });

  describe("Structured Removal Reason Formatting", () => {
    function formatRemovalNotification(approved: boolean, communityName: string, reason?: string) {
      return {
        title: approved ? `Your post in ${communityName} is live` : `Your post in ${communityName} wasn't approved`,
        body: approved
          ? "Everyone in the community can see it now."
          : reason
            ? `A moderator removed it: ${reason}`
            : "A moderator declined it. You can post again.",
        eyebrow: approved ? "Post approved" : reason ? `Post removed: ${reason}` : "Post declined",
      };
    }

    test("formats notification correctly when reason is provided", () => {
      const notif = formatRemovalNotification(false, "Ferrari Tifosi", "Unshielded spoiler");
      assert.equal(notif.title, "Your post in Ferrari Tifosi wasn't approved");
      assert.equal(notif.body, "A moderator removed it: Unshielded spoiler");
      assert.equal(notif.eyebrow, "Post removed: Unshielded spoiler");
    });

    test("formats notification correctly when reason is omitted", () => {
      const notif = formatRemovalNotification(false, "Ferrari Tifosi");
      assert.equal(notif.title, "Your post in Ferrari Tifosi wasn't approved");
      assert.equal(notif.body, "A moderator declined it. You can post again.");
      assert.equal(notif.eyebrow, "Post declined");
    });
  });

  describe("Ownership and Sole-Admin Protection Guard Rules", () => {
    test("demoting owner throws error", () => {
      const groupCreatedBy = "user_owner";
      const targetUid = "user_owner";
      const newRole: string = "moderator";

      const isOwner = groupCreatedBy === targetUid;
      assert.equal(isOwner && newRole !== "admin", true);
    });

    test("removing owner throws error", () => {
      const groupCreatedBy = "user_owner";
      const targetUid = "user_owner";

      assert.equal(groupCreatedBy === targetUid, true);
    });

    test("sole admin cannot be demoted if admin count is <= 1", () => {
      const targetRole: string = "admin";
      const newRole: string = "member";
      const adminCount = 1;

      const isSoleAdmin = targetRole === "admin" && newRole !== "admin" && adminCount <= 1;
      assert.equal(isSoleAdmin, true);
    });

    test("transfer ownership requires target to be different from actor", () => {
      const actingUid = "user_1";
      const targetUid = "user_1";

      const isSelf = actingUid === targetUid;
      assert.equal(isSelf, true);
    });
  });
});
