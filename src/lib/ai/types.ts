// Core AI type definitions — the foundation every other module in src/lib/ai/ depends on.
// Designed around the NVIDIA NIM / OpenAI-compatible chat completions API the configured model
// (DeepSeek V4 Flash, formerly Kimi K3) uses, but deliberately abstract enough that swapping to
// OpenAI, Gemini, or a local model later means implementing one new provider file, not rewriting
// the orchestrator or tools - which is exactly what happened swapping Kimi K3 for DeepSeek.

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
  /** Provider-level timeout in milliseconds. */
  timeoutMs: number;
  /** Controls how much reasoning the model does before answering. Kimi K3 (the previous provider)
   * only accepted "low" | "high" | "max" via a top-level `reasoning_effort` field - "medium" made
   * every single request fail with HTTP 400, confirmed live in production. DeepSeek (the current
   * provider) takes this nested under `chat_template_kwargs` instead (see deepseek.ts) and its
   * exact accepted value set isn't documented anywhere as clearly as Kimi's error message was, so
   * this is passed through as configured rather than clamped to an assumed set. */
  reasoningEffort?: "none" | "low" | "medium" | "high" | "max";
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
};

export type AgentType =
  | "homepage_intelligence"
  | "race_brief"
  | "prediction_coach"
  | "model_explanation"
  | "community_pulse"
  | "season_story"
  | "since_last_visit";

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

export type AIOperationLog = {
  requestId: string;
  agentType: AgentType;
  userId: string | null; // hashed or safe identifier, never raw PII
  provider: string;
  model: string;
  promptVersion?: string;
  toolCalls: { name: string; durationMs: number; success: boolean }[];
  totalDurationMs: number;
  tokenUsage?: { promptTokens: number; completionTokens: number; totalTokens: number };
  cacheHit: boolean;
  cacheKeyType?: "global" | "personal" | "none";
  validationSuccess: boolean;
  providerRPMCurrent?: number;
  providerRPMLimit?: number;
  capacityExhausted?: boolean;
  fallbackUsed?: boolean;
  fallbackReason?: string;
  retryCount?: number;
  errorCategory?: string;
  finishReason?: string;
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

export function getDefaultAIModel(): string {
  return process.env.NVIDIA_AI_MODEL || "deepseek-ai/deepseek-v4-flash-0731";
}

export function getProviderRPMLimit(): number {
  const envVal = process.env.AI_PROVIDER_RPM_LIMIT || process.env.NVIDIA_RPM_LIMIT;
  const parsed = envVal ? parseInt(envVal, 10) : 40;
  return isNaN(parsed) || parsed <= 0 ? 40 : parsed;
}

export const DEFAULT_ORCHESTRATOR_CONFIG: OrchestratorConfig = {
  maxSteps: 8,
  maxToolCalls: 12,
  maxRetries: 1,
  timeoutMs: 60_000,
  maxResponseTokens: 2048,
  provider: {
    model: "deepseek-ai/deepseek-v4-flash-0731",
    maxTokens: 2048,
    temperature: 0.7,
    timeoutMs: 30_000,
    // DeepSeek's reasoning_effort lives under chat_template_kwargs, not top-level (see
    // deepseek.ts) - "high" is the one value confirmed to work via a real, working example.
    reasoningEffort: "high",
  },
};
