import { describe, it } from "node:test";
import assert from "node:assert/strict";
import { APEX_BOT_USER_ID, isApexBot } from "@/lib/ai/apexBot";
import { shouldTriggerApexCopilot } from "@/lib/ai/apexCopilot";
import { generateDeterministicSummaryFallback } from "@/lib/ai/threadSummary";
import { generateDeterministicTriageFallback, type ReportForTriage } from "@/lib/ai/moderationTriage";

describe("Level 5: AI Discussion Copilot & Thread Intelligence", () => {
  describe("Apex AI Bot Identity & Detection", () => {
    it("recognizes APEX_BOT_USER_ID as the official bot", () => {
      assert.equal(isApexBot(APEX_BOT_USER_ID), true);
      assert.equal(isApexBot("c0000000-0000-0000-0000-000000000001"), false);
      assert.equal(isApexBot(undefined), false);
    });

    it("triggers copilot on explicit mentions of @apex", () => {
      assert.equal(shouldTriggerApexCopilot("@apex what was the lap delta?", "user-123"), true);
      assert.equal(shouldTriggerApexCopilot("Hey @Apex, what tyre strategy works best here?", "user-123"), true);
      assert.equal(shouldTriggerApexCopilot("Is that true @APEX?", "user-123"), true);
    });

    it("does not trigger copilot on self-mentions by the bot", () => {
      assert.equal(shouldTriggerApexCopilot("Hello @apex from Apex", APEX_BOT_USER_ID), false);
    });

    it("does not trigger copilot on non-mention or email text", () => {
      assert.equal(shouldTriggerApexCopilot("He hit the apex on turn 4 perfectly.", "user-123"), false);
      assert.equal(shouldTriggerApexCopilot("contact us at admin@apexf1hub.com", "user-123"), false);
      assert.equal(shouldTriggerApexCopilot("", "user-123"), false);
    });
  });

  describe("Deterministic Thread Summaries", () => {
    it("generates a structured summary from comments", () => {
      const comments = [
        { author: "Lewis", content: "Ferrari's race pace on the hard tyre was surprisingly strong in FP2." },
        { author: "Max", content: "I agree, their long run telemetry looked faster than McLaren." },
        { author: "Lando", content: "I disagree on degradation though; high altitude might overheat their brakes." },
        { author: "Charles", content: "Will track temperature drop enough for a 1-stop strategy during the Grand Prix?" },
      ];

      const summary = generateDeterministicSummaryFallback("Mexico GP Pace Analysis", "Initial thoughts on FP2 telemetry", comments);

      assert.ok(summary.tldr.length > 0, "TL;DR should not be empty");
      assert.equal(summary.commentCount, 4);
      assert.ok(Array.isArray(summary.consensus), "Consensus should be an array");
      assert.ok(Array.isArray(summary.debates), "Debates should be an array");
      assert.ok(Array.isArray(summary.openQuestions), "Open questions should be an array");
      assert.ok(summary.openQuestions.some((q) => q.includes("?") || q.toLowerCase().includes("will")), "Should capture questions");
      assert.ok(summary.debates.some((d) => d.toLowerCase().includes("disagree") || d.toLowerCase().includes("degradation")), "Should capture debate points");
    });

    it("handles short threads gracefully", () => {
      const summary = generateDeterministicSummaryFallback("Quick question", "Is FP3 wet?", [
        { author: "Oscar", content: "Radar shows 10% chance of rain." },
      ]);

      assert.equal(summary.commentCount, 1);
      assert.ok(summary.tldr.length > 0);
    });
  });

  describe("Deterministic Moderation Triage", () => {
    it("classifies reports by severity and category accurately", () => {
      const reports: ReportForTriage[] = [
        {
          id: "rep-1",
          targetType: "post",
          targetExcerpt: "You idiot, leave this platform you toxic loser",
          reason: "harassment and personal attacks",
          createdAt: new Date().toISOString(),
        },
        {
          id: "rep-2",
          targetType: "comment",
          targetExcerpt: "HAMILTON WINS THE RACE P1 AFTER VER CRASHES OUT!!",
          reason: "unmarked race spoiler in discussion feed",
          createdAt: new Date().toISOString(),
        },
        {
          id: "rep-3",
          targetType: "post",
          targetExcerpt: "Join my crypto betting Telegram channel at https://spam.fake",
          reason: "unsolicited commercial spam promo",
          createdAt: new Date().toISOString(),
        },
        {
          id: "rep-4",
          targetType: "comment",
          targetExcerpt: "I think Williams might score points this weekend.",
          reason: "off-topic debate",
          createdAt: new Date().toISOString(),
        },
      ];

      const triage = generateDeterministicTriageFallback(reports);

      assert.equal(triage.totalReports, 4);
      assert.equal(triage.highSeverityCount, 1);

      const r1 = triage.items.find((i) => i.reportId === "rep-1");
      assert.ok(r1);
      assert.equal(r1.severity, "high");
      assert.equal(r1.category, "harassment");
      assert.equal(r1.recommendedAction, "remove_content");

      const r2 = triage.items.find((i) => i.reportId === "rep-2");
      assert.ok(r2);
      assert.equal(r2.severity, "medium");
      assert.equal(r2.category, "spoiler");
      assert.equal(r2.recommendedAction, "remove_content");

      const r3 = triage.items.find((i) => i.reportId === "rep-3");
      assert.ok(r3);
      assert.equal(r3.severity, "medium");
      assert.equal(r3.category, "spam");
      assert.equal(r3.recommendedAction, "remove_content");

      const r4 = triage.items.find((i) => i.reportId === "rep-4");
      assert.ok(r4);
      assert.equal(r4.severity, "low");
      assert.equal(r4.recommendedAction, "dismiss");
    });

    it("handles empty queues cleanly", () => {
      const triage = generateDeterministicTriageFallback([]);
      assert.equal(triage.totalReports, 0);
      assert.equal(triage.highSeverityCount, 0);
      assert.equal(triage.items.length, 0);
    });
  });
});
