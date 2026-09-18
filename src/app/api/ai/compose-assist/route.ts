import { NextResponse } from "next/server";
import crypto from "crypto";
import { getSession } from "@/lib/session/getSession";
import { guardAIExecution, sanitizePromptInput } from "@/lib/ai/guardrails";
import { chatWithProviderFallback } from "@/lib/ai/providerFallback";
import { logAIError } from "@/lib/ai/telemetry";

export const maxDuration = 30;

/**
 * POST /api/ai/compose-assist
 *
 * Rewrites the viewer's own draft one way or another. Deliberately NOT cached and NOT shared: the
 * input is one person's unpublished text, so there is nothing here that another reader should ever
 * be served, and it must not go anywhere near the shared `ai_cache` the grounded surfaces use.
 *
 * This never publishes anything. It returns a suggestion the composer shows beside the original for
 * the author to accept or reject - see ComposeAssist's own comment for why that matters.
 */
const ACTIONS = {
  improve: "Improve the writing. Keep the author's voice, meaning and any specific facts exactly as they are.",
  grammar: "Fix spelling, grammar and punctuation only. Do not reword anything that is already correct.",
  concise: "Make this more concise. Remove padding, keep every substantive point.",
  clearer: "Make this clearer and easier to read. Do not add new claims.",
  engaging: "Make this more engaging to read for a motorsport community, without hype or exaggeration.",
  expand: "Expand this slightly with more detail, using ONLY what the author already implies. Invent no new facts.",
  formal: "Rewrite this in a more formal register, keeping the meaning identical.",
} as const;

type Action = keyof typeof ACTIONS;

const MAX_DRAFT_CHARS = 2000;

const SYSTEM_PROMPT = [
  "You rewrite a single social post draft for an F1 community app.",
  "Return ONLY the rewritten text. No preamble, no quotes around it, no commentary, no markdown fences.",
  "Never invent facts, statistics, results, dates or quotes that are not already in the draft.",
  "Keep it roughly the same length unless the instruction explicitly says otherwise.",
  "If the draft is already good, return it essentially unchanged.",
].join(" ");

export async function POST(req: Request) {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  const session = await getSession();
  if (!session.uid) return NextResponse.json({ error: "Not signed in" }, { status: 401 });

  const body = (await req.json().catch(() => null)) as { text?: unknown; action?: unknown } | null;
  const rawText = typeof body?.text === "string" ? body.text.trim() : "";
  const action = typeof body?.action === "string" && body.action in ACTIONS ? (body.action as Action) : null;

  if (!rawText) return NextResponse.json({ error: "Write something first." }, { status: 400 });
  if (!action) return NextResponse.json({ error: "Unknown action." }, { status: 400 });
  if (rawText.length > MAX_DRAFT_CHARS) return NextResponse.json({ error: "That draft is too long to rewrite." }, { status: 400 });

  // The same per-user rate limiting every other AI surface in this app goes through - a composer
  // button is the easiest place in the product to hold down.
  const guard = guardAIExecution(session.uid);
  if (!guard.allowed) return NextResponse.json({ error: "Too many requests - give it a moment." }, { status: 429 });

  const draft = sanitizePromptInput(rawText, MAX_DRAFT_CHARS);

  try {
    const result = await chatWithProviderFallback(
      [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: `Instruction: ${ACTIONS[action]}\n\nDraft:\n${draft}` },
      ],
      null,
      { maxTokens: 700, temperature: 0.4 },
      requestId,
    );

    const suggestion = (result.response.content ?? "").trim().replace(/^```[a-z]*\n?|\n?```$/g, "");
    if (!suggestion) return NextResponse.json({ error: "Apex couldn't rewrite that." }, { status: 502 });

    return NextResponse.json({ suggestion });
  } catch (err) {
    logAIError(requestId, "compose_assist_failed", String(err));
    // A writing aid failing must never look like the composer failing - the draft is untouched and
    // still perfectly postable.
    return NextResponse.json({ error: "Apex is unavailable right now." }, { status: 503 });
  }
}
