import { chatWithProviderFallback } from "@/lib/ai/providerFallback";
import { logAIError } from "@/lib/ai/telemetry";

export type ReportForTriage = {
  id: string;
  targetType: "post" | "comment";
  targetExcerpt: string;
  reason: string;
  createdAt: string;
};

export type ReportTriageItem = {
  reportId: string;
  severity: "low" | "medium" | "high";
  category: "spam" | "spoiler" | "harassment" | "off_topic" | "guidelines" | "false_alarm";
  synopsis: string;
  recommendedAction: "dismiss" | "remove_content" | "mute_author" | "ban_user" | "monitor";
};

export type ModerationTriageResult = {
  totalReports: number;
  highSeverityCount: number;
  summary: string;
  items: ReportTriageItem[];
  generatedAt: string;
};

const SYSTEM_PROMPT = `You are Apex AI, an expert community safety and moderation triage specialist for Apex F1 Hub.
Analyze the following open moderation reports submitted by community members.
Classify each report by severity (low, medium, high), category, and recommend a clear moderator action.
Respond ONLY with a valid JSON object matching this schema:
{
  "summary": "1-2 sentence overview of the queue health and highest priority violations.",
  "items": [
    {
      "reportId": "ID of the report",
      "severity": "low" | "medium" | "high",
      "category": "spam" | "spoiler" | "harassment" | "off_topic" | "guidelines" | "false_alarm",
      "synopsis": "1 sentence summarizing the core issue or why it was flagged",
      "recommendedAction": "dismiss" | "remove_content" | "mute_author" | "ban_user" | "monitor"
    }
  ]
}
Guidelines:
- "high" severity: Direct harassment, abusive language, malicious links, hate speech -> recommend "remove_content" or "mute_author".
- "medium" severity: Unshielded qualifying/race spoilers right after a session, commercial spam -> recommend "remove_content".
- "low" severity: Mild off-topic discussion, heated debate without personal attacks, or benign misunderstandings -> recommend "dismiss" or "monitor".
- Be decisive, neutral, and adhere strictly to the JSON schema without any markdown formatting.`;

export function generateDeterministicTriageFallback(reports: ReportForTriage[]): ModerationTriageResult {
  const items: ReportTriageItem[] = reports.map((r) => {
    const text = (r.reason + " " + r.targetExcerpt).toLowerCase();
    const isSpoiler = text.includes("spoiler") || text.includes("result") || text.includes("p1") || text.includes("winner");
    const isHarassment = text.includes("harass") || text.includes("abuse") || text.includes("insult") || text.includes("toxic");
    const isSpam = text.includes("spam") || text.includes("promo") || text.includes("ad") || text.includes("http");

    const severity: "low" | "medium" | "high" = isHarassment ? "high" : isSpoiler || isSpam ? "medium" : "low";
    const category: ReportTriageItem["category"] = isHarassment ? "harassment" : isSpoiler ? "spoiler" : isSpam ? "spam" : "guidelines";
    const recommendedAction: ReportTriageItem["recommendedAction"] = severity === "high" || severity === "medium" ? "remove_content" : "dismiss";

    return {
      reportId: r.id,
      severity,
      category,
      synopsis: `Reported for "${r.reason}": "${r.targetExcerpt.slice(0, 80)}"`,
      recommendedAction,
    };
  });

  const highSeverityCount = items.filter((i) => i.severity === "high").length;

  return {
    totalReports: reports.length,
    highSeverityCount,
    summary: `${reports.length} open reports analyzed. ${highSeverityCount > 0 ? `${highSeverityCount} high-priority item(s) require prompt attention.` : "No critical safety violations detected."}`,
    items,
    generatedAt: new Date().toISOString(),
  };
}

export async function triageModerationReports(
  reports: ReportForTriage[],
  requestId = `triage_${Date.now()}`
): Promise<ModerationTriageResult> {
  if (reports.length === 0) {
    return {
      totalReports: 0,
      highSeverityCount: 0,
      summary: "The moderation queue is clear. No open reports to triage.",
      items: [],
      generatedAt: new Date().toISOString(),
    };
  }

  const reportsTranscript = reports.slice(0, 25).map((r, i) => {
    return `[Report #${i + 1}] ID: ${r.id} | Target: ${r.targetType}\nREASON: "${r.reason}"\nCONTENT EXCERPT: "${r.targetExcerpt.replace(/\s+/g, " ").trim()}"`;
  }).join("\n\n");

  try {
    const result = await chatWithProviderFallback(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `OPEN REPORTS FOR TRIAGE (${reports.length} total):\n\n${reportsTranscript}` },
      ],
      null,
      {
        maxTokens: 1000,
        temperature: 0.2,
      },
      requestId
    );

    const raw = result.response.content?.trim() ?? "";
    const cleanJson = raw.startsWith("```") ? raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "") : raw;
    const parsed = JSON.parse(cleanJson) as {
      summary?: string;
      items?: ReportTriageItem[];
    };

    const validItems: ReportTriageItem[] = Array.isArray(parsed.items)
      ? parsed.items.map((item) => ({
          reportId: String(item.reportId || ""),
          severity: ["low", "medium", "high"].includes(item.severity) ? item.severity : "low",
          category: ["spam", "spoiler", "harassment", "off_topic", "guidelines", "false_alarm"].includes(item.category)
            ? item.category
            : "guidelines",
          synopsis: typeof item.synopsis === "string" ? item.synopsis : "Reported content",
          recommendedAction: ["dismiss", "remove_content", "mute_author", "ban_user", "monitor"].includes(item.recommendedAction)
            ? item.recommendedAction
            : "dismiss",
        }))
      : [];

    const highSeverityCount = validItems.filter((i) => i.severity === "high").length;

    return {
      totalReports: reports.length,
      highSeverityCount,
      summary: parsed.summary || `${reports.length} reports triaged.`,
      items: validItems,
      generatedAt: new Date().toISOString(),
    };
  } catch (err) {
    logAIError(requestId, "moderation_triage_failed", String(err));
    return generateDeterministicTriageFallback(reports);
  }
}
