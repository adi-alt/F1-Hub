// POST /api/ai/ask-apex
// The homepage's real single-turn conversational Q&A endpoint - grounded in the client's already-
// fetched HomepageIntelligence (untrusted reference data, not instructions - see askApexPrompt.ts's
// adversarial-protection rule), no caching (a per-question answer isn't cacheable), no persistence
// (the client keeps an ephemeral transcript; nothing here is stored). Small and in-pattern: reuses
// the same guardAIExecution/sanitizePromptInput/chatWithProviderFallback primitives every other AI
// route already uses, just returning prose instead of a validated schema.

import { NextResponse } from "next/server";
import { getSession } from "@/lib/session/getSession";
import { guardAIExecution, sanitizePromptInput } from "@/lib/ai/guardrails";
import { generateAskApexAnswer } from "@/lib/ai/orchestrator";
import { logAIError } from "@/lib/ai/telemetry";
import { getUserProfile } from "@/lib/supabase/users";
import type { AgentContext } from "@/lib/ai/types";
import crypto from "crypto";

export const maxDuration = 30;

const MAX_QUESTION_LENGTH = 500;
const MAX_HISTORY_TURNS = 6;
const MAX_INTELLIGENCE_JSON_LENGTH = 6000;
// A defensive cap on the raw client payload BEFORE it's ever JSON.stringify'd/sanitized - an
// untrusted client could send an arbitrarily large object; bail out early rather than paying the
// cost of serializing/sanitizing something enormous.
const MAX_RAW_PAYLOAD_BYTES = 50_000;
const CAPACITY_FALLBACK_TEXT = "Apex is at capacity right now - try again in a moment.";

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export async function POST(req: Request) {
  const requestId = `req_${Date.now()}_${crypto.randomBytes(4).toString("hex")}`;

  try {
    const session = await getSession();
    const userId = session?.uid || null;
    // The widget only ever mounts for a signed-in PersonalHome - this is a defensive check, not a
    // real traffic path.
    if (!userId) return NextResponse.json({ error: "UNAUTHENTICATED" }, { status: 401 });

    // Same combined user-quota + provider-capacity guard every other AI route uses (guardrails.ts) -
    // a cheap early exit before touching the DB or the provider at all.
    const guard = guardAIExecution(userId);
    if (!guard.allowed) {
      return NextResponse.json({
        answer: CAPACITY_FALLBACK_TEXT,
        favoriteKey: "",
        favoriteKeyChanged: false,
        isFallback: true,
        fallbackReason: guard.reason,
        retryAfterSeconds: guard.retryAfterSeconds,
      });
    }

    const body: unknown = await req.json().catch(() => null);
    if (!isPlainObject(body) || typeof body.question !== "string") {
      return NextResponse.json({ error: "INVALID_REQUEST" }, { status: 400 });
    }

    const question = sanitizePromptInput(body.question, MAX_QUESTION_LENGTH);
    if (!question) {
      return NextResponse.json({
        answer: "Ask me something about this race, the standings, or the model's picks.",
        favoriteKey: "",
        favoriteKeyChanged: false,
        isFallback: false,
      });
    }

    // History is client-echoed, ephemeral conversation state - re-capped and re-sanitized here
    // regardless of what the client sent, never trusted as-is.
    const rawHistory = Array.isArray(body.history) ? body.history : [];
    const history = rawHistory
      .filter((t): t is { role: string; content: string } => isPlainObject(t) && (t.role === "user" || t.role === "assistant") && typeof t.content === "string")
      .slice(-MAX_HISTORY_TURNS)
      .map((t) => ({ role: t.role as "user" | "assistant", content: sanitizePromptInput(t.content, MAX_QUESTION_LENGTH) }));

    // intelligenceSnapshot is CLIENT-SUPPLIED and therefore untrusted input, not just reference
    // data - validated defensively (plain object, hard size cap) before it's ever serialized into
    // the prompt. Every string inside it is treated purely as data inside <APEX_BRIEFING_JSON> by
    // the prompt's own adversarial-protection rule (askApexPrompt.ts) - never as instructions - and
    // a tampered payload has no cross-user blast radius since this route only ever answers using
    // the caller's own already-visible page data.
    const snapshot = isPlainObject(body.intelligenceSnapshot) ? body.intelligenceSnapshot : {};
    const rawJson = JSON.stringify(snapshot);
    if (rawJson.length > MAX_RAW_PAYLOAD_BYTES) {
      return NextResponse.json({ error: "PAYLOAD_TOO_LARGE" }, { status: 413 });
    }
    const intelligenceJson = sanitizePromptInput(rawJson, MAX_INTELLIGENCE_JSON_LENGTH);

    const conversationFavoriteKey = typeof body.conversationFavoriteKey === "string" ? body.conversationFavoriteKey : "";

    // Server-authoritative favorite identity - never trust the client's own notion of "did my
    // favorites change", since that's exactly the state a stale conversation needs to be corrected
    // against.
    const profile = await getUserProfile(userId).catch(() => null);
    const favoriteKey = `${profile?.favoriteDrivers?.[0] ?? ""}:${profile?.favoriteTeams?.[0] ?? ""}`;
    const favoriteKeyChanged = conversationFavoriteKey !== "" && conversationFavoriteKey !== favoriteKey;

    const ctx: AgentContext = { userId, requestId, agentType: "ask_apex", raceId: null };
    const result = await generateAskApexAnswer(question, history, intelligenceJson, ctx);

    return NextResponse.json({
      answer: result.answer,
      favoriteKey,
      favoriteKeyChanged,
      isFallback: result.isFallback,
      fallbackReason: result.fallbackReason,
    });
  } catch (err) {
    logAIError(requestId, "ask_apex_unhandled_route_exception", String(err));
    return NextResponse.json({ answer: CAPACITY_FALLBACK_TEXT, favoriteKey: "", favoriteKeyChanged: false, isFallback: true, fallbackReason: "SERVER_EXCEPTION" });
  }
}
