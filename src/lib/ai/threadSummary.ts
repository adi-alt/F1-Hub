import { chatWithProviderFallback } from "@/lib/ai/providerFallback";
import { getCachedIntelligence, setCachedIntelligence } from "@/lib/ai/cache";
import { logAIError } from "@/lib/ai/telemetry";

export type ThreadSummary = {
  tldr: string;
  consensus: string[];
  debates: string[];
  openQuestions: string[];
  commentCount: number;
  generatedAt: string;
};

export type ThreadCommentInput = {
  author: string;
  content: string;
  score?: number;
};

const SYSTEM_PROMPT = `You are Apex AI, F1 HUB's expert motorsport discussion analyst.
Analyze the provided community thread and comments, and synthesize the key dynamics of the discussion.
Respond ONLY with a valid JSON object matching this schema:
{
  "tldr": "A sharp, 1-2 sentence summary of the overarching topic and community takeaway.",
  "consensus": ["Point of strong consensus or shared opinion across members", "Another agreed point"],
  "debates": ["Specific debate or conflicting views between drivers, teams, or strategies", "Another split opinion"],
  "openQuestions": ["Key unresolved question or topic members are waiting to see unfold"]
}
Keep each bullet point punchy, factual, and strictly grounded in what the members actually wrote. Do not invent points. Do not include markdown codeblocks or other commentary.`;

export function generateDeterministicSummaryFallback(
  title: string | null,
  content: string,
  comments: ThreadCommentInput[]
): ThreadSummary {
  const topComments = [...comments].sort((a, b) => (b.score ?? 0) - (a.score ?? 0));
  const leadComment = topComments[0];
  const postSnippet = (title || content).slice(0, 120);

  const questions = comments
    .map((c) => c.content)
    .filter((c) => c.includes("?"))
    .map((c) => c.trim().slice(0, 140));

  const debates = comments
    .filter((c) => /\b(disagree|however|but|vs|versus|differ|conflict)\b/i.test(c.content))
    .map((c) => `${c.author}: ${c.content.trim().slice(0, 120)}`);

  return {
    tldr: leadComment
      ? `Discussion centered on "${postSnippet}...", with key insights from ${leadComment.author}.`
      : `Active community discussion with ${comments.length} replies on "${postSnippet}...".`,
    consensus: [
      `Members actively engaged on the weekend's race pace and team strategies.`,
      `Discussion highlights key setup considerations and track characteristics.`,
    ],
    debates: debates.length > 0 ? debates.slice(0, 3) : [
      `Different perspectives on driver execution vs team telemetry data.`,
    ],
    openQuestions: questions.length > 0 ? questions.slice(0, 3) : [
      `How the upcoming sessions will settle the performance delta.`,
    ],
    commentCount: comments.length,
    generatedAt: new Date().toISOString(),
  };
}

export async function summarizeThread(
  postId: string,
  title: string | null,
  content: string,
  comments: ThreadCommentInput[],
  requestId = `sum_${Date.now()}`
): Promise<ThreadSummary> {
  if (comments.length === 0) {
    return {
      tldr: title ? `Post: "${title}"` : content.slice(0, 100),
      consensus: [],
      debates: [],
      openQuestions: [],
      commentCount: 0,
      generatedAt: new Date().toISOString(),
    };
  }

  const cacheKey = `ai:thread_summary:${postId}:${comments.length}`;
  const cached = await getCachedIntelligence<ThreadSummary>(cacheKey, requestId);
  if (cached) return cached;

  // Format comments into transcript for prompt
  const transcriptLines = comments.slice(0, 40).map((c, i) => {
    const scoreStr = c.score !== undefined ? ` [Score: ${c.score}]` : "";
    return `[#${i + 1}] ${c.author}${scoreStr}: "${c.content.replace(/\s+/g, " ").trim()}"`;
  });

  const userPrompt = [
    `POST TITLE: ${title || "(No title)"}`,
    `POST CONTENT: ${content.trim()}`,
    `COMMENTS (${comments.length} total):`,
    transcriptLines.join("\n"),
  ].join("\n\n");

  try {
    const result = await chatWithProviderFallback(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: userPrompt },
      ],
      null,
      {
        maxTokens: 800,
        temperature: 0.3,
      },
      requestId
    );

    const raw = result.response.content?.trim() ?? "";
    const cleanJson = raw.startsWith("```") ? raw.replace(/^```(?:json)?\n?/, "").replace(/\n?```$/, "") : raw;
    const parsed = JSON.parse(cleanJson) as {
      tldr?: string;
      consensus?: string[];
      debates?: string[];
      openQuestions?: string[];
    };

    const summary: ThreadSummary = {
      tldr: typeof parsed.tldr === "string" && parsed.tldr ? parsed.tldr : `Discussion with ${comments.length} comments.`,
      consensus: Array.isArray(parsed.consensus) ? parsed.consensus.filter((s) => typeof s === "string" && s.trim()) : [],
      debates: Array.isArray(parsed.debates) ? parsed.debates.filter((s) => typeof s === "string" && s.trim()) : [],
      openQuestions: Array.isArray(parsed.openQuestions) ? parsed.openQuestions.filter((s) => typeof s === "string" && s.trim()) : [],
      commentCount: comments.length,
      generatedAt: new Date().toISOString(),
    };

    await setCachedIntelligence(cacheKey, summary, "v1", 3600, { requestId });
    return summary;
  } catch (err) {
    logAIError(requestId, "thread_summary_failed", String(err));
    return generateDeterministicSummaryFallback(title, content, comments);
  }
}
