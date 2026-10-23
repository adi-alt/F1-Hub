// Core AI type definitions — the foundation every other module in src/lib/ai/ depends on.
// Designed around the OpenAI-compatible chat completions API both providers speak (Groq, with
// OpenRouter as the fallback - see provider.ts), but abstract enough that swapping providers means
// implementing one new provider file, not rewriting the orchestrator or tools. See docs/AGENTIC_AI.md.

// ─── Messages ──────────────────────────────────────────────────────────────────

/** A single content part — text today, image_url later (some hosted models support multimodal
 * input). */
export type AIContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type AIMessageRole = "system" | "user" | "assistant" | "tool";

export type AIMessage = {
  role: AIMessageRole;
  content: string | AIContentPart[];
  /** Only present on role==="tool" — the id of the tool_call this result is for. */
  tool_call_id?: string;
  /** Only present on role==="assistant" when the model wants to call tools. */
  tool_calls?: AIToolCall[];
};

export type AIToolCall = {
  id: string;
  type: "function";
  function: { name: string; arguments: string };
};

// ─── Tools ─────────────────────────────────────────────────────────────────────

/** A tool the agent can call — a narrow, deterministic application function, never arbitrary
 * SQL/shell/HTTP. `parametersSchema` is a JSON Schema object describing the expected arguments;
 * `execute` receives the parsed arguments + the agent context (which carries the authenticated
 * userId from the server session, never from the model). */
export type AITool = {
  name: string;
  description: string;
  parametersSchema: Record<string, unknown>;
  /** Whether this tool accesses user-specific data (picks, favorites, groups). User-scoped tools
   * always receive the authenticated userId from AgentContext, never from model-provided args. */
  isUserScoped: boolean;
  execute: (args: Record<string, unknown>, ctx: AgentContext) => Promise<unknown>;
};

// ─── Provider & Rate Limiting ──────────────────────────────────────────────────

export type AIProviderConfig = {
  model: string;
  maxTokens: number;
  temperature: number;
  /** Nucleus sampling cutoff. Optional: omitted unless a caller sets it. */
  topP?: number;
  /** Provider-level timeout in milliseconds. */
  timeoutMs: number;
  /** Reasoning depth for gpt-oss models: sent as `reasoning_effort` to Groq and `reasoning.effort`
   * to OpenRouter (low/medium/high only; other values are not sent). */
  reasoningEffort?: "none" | "low" | "medium" | "high" | "max";
  /** Per-call API key override - lets one provider class (GroqProvider) be shared across multiple
   * accounts/keys (one per real AI feature, for genuine isolation - see providerFallback.ts's own
   * comment) without needing a separate registered provider instance per key. Falls back to the
   * provider's own default env var when omitted. */
  apiKey?: string;
};

export type AIProviderToolDef = {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
};

export type AIResponse = {
  content: string | null;
  toolCalls: AIToolCall[];
  finishReason: "stop" | "tool_calls" | "length" | "content_filter" | string;
  usage?: { promptTokens: number; completionTokens: number; totalTokens: number };
};

export type ProviderCapacityStatus = {
  allowed: boolean;
  currentRPM: number;
  limit: number;
  retryAfterSeconds: number;
};

// ─── Agent Context ─────────────────────────────────────────────────────────────

/** Immutable context for a single agent invocation — created by the API route from the
 * authenticated server session, never modifiable by the model. */
export type AgentContext = {
  /** The authenticated user's ID, derived from the server session. Null for unauthenticated
   * requests (global-only intelligence). */
  userId: string | null;
  /** A unique ID for this agent invocation, for telemetry/debugging. */
  requestId: string;
  /** Which agent is running — drives prompt selection and cache keys. */
  agentType: AgentType;
  /** The current race ID, if the intelligence is race-specific. */
  raceId: string | null;
  /** Prompt template version used for this run. */
  promptVersion?: string;
  /** The cache data-version fingerprint this generation is for, if the caller already computed one
   * (see cache.ts's computeDataVersion) - threaded through so logAIOperation can record it without
   * every orchestrator function needing its own separate parameter for the same value. */
  dataVersion?: string;
};

export type AgentType =
  | "homepage_intelligence"
  | "season_intelligence"
  | "season_compare"
  | "season_race_take"
  | "circuit_take"
  | "race_intelligence"
  | "race_brief"
  | "prediction_coach"
  | "model_explanation"
  | "community_pulse"
  | "season_story"
  | "since_last_visit"
  | "ask_apex";

// ─── Structured Output ─────────────────────────────────────────────────────────

/** Every AI-generated structured result carries optional evidence metadata so claims can be
 * traced back to the structured data they were derived from. */
export type EvidenceEntry = {
  type: string; // e.g. "race_result", "standings", "simulation", "track_history"
  sourceId?: string; // e.g. raceId, driverId
  field?: string; // e.g. "finishPosition", "p1"
};

export type StructuredOutput<T> = {
  data: T;
  evidence?: EvidenceEntry[];
  generatedAt: string;
  dataVersion: string;
  agentType: AgentType;
  modelIdentifier?: string;
  promptVersion?: string;
  isFallback?: boolean;
  fallbackReason?: string;
};

// ─── Observability & Telemetry ─────────────────────────────────────────────────

/** A small, fixed set of failure buckets - so a log query can group "why did this fall back"
 * without parsing free-text error messages. See errorCategory.ts for the actual classifiers. */
export const AI_ERROR_CATEGORIES = [
  "rate_limit",
  "timeout",
  "provider_error",
  "authentication",
  "configuration",
  "invalid_response",
  "schema_validation",
  "deterministic_fallback",
  "unknown",
] as const;
export type AIErrorCategory = (typeof AI_ERROR_CATEGORIES)[number];

export type AIOperationLog = {
  requestId: string;
  agentType: AgentType;
  userId: string | null; // hashed or safe identifier, never raw PII
  provider: string;
  model: string;
  promptVersion?: string;
  /** The cache data-version fingerprint this generation was for (see cache.ts's
   * computeDataVersion) - lets a log query tie a generation back to the exact underlying-data
   * snapshot it reflects. */
  dataVersion?: string;
  toolCalls: { name: string; durationMs: number; success: boolean }[];
  totalDurationMs: number;
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  cacheHit: boolean;
  cacheKeyType?: "global" | "personal" | "none";
  validationSuccess: boolean;
  /** The provider's own reported stop reason ("stop"/"length"/"tool_calls"/etc.) when a real
   * response was received - absent when generation never reached a provider response at all
   * (e.g. rate-limited before attempting, or the provider call itself threw). */
  finishReason?: string;
  providerRPMCurrent?: number;
  providerRPMLimit?: number;
  capacityExhausted?: boolean;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  retryCount?: number;
  errorCategory?: AIErrorCategory;
};

// ─── Orchestrator Config ───────────────────────────────────────────────────────

export type OrchestratorConfig = {
  maxSteps: number;
  maxToolCalls: number;
  maxRetries: number;
  timeoutMs: number;
  maxResponseTokens: number;
  provider: AIProviderConfig;
};

export function getProviderRPMLimit(): number {
  const envVal = process.env.AI_PROVIDER_RPM_LIMIT;
  const parsed = envVal ? parseInt(envVal, 10) : 40;
  return isNaN(parsed) || parsed <= 0 ? 40 : parsed;
}
