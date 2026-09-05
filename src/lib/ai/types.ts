// Core AI type definitions — the foundation every other module in src/lib/ai/ depends on.
// Designed around the NVIDIA NIM / OpenAI-compatible chat completions API the configured model
// (Muse Glimmer 30B, formerly Nemotron 3.5 Lightning, DeepSeek V4 Flash, and Kimi K3 before that)
// uses, but deliberately abstract enough that swapping providers later means implementing one new
// provider file, not rewriting the orchestrator or tools - which is exactly what's happened four
// times now. See museGlimmer.ts and docs/AGENTIC_AI.md for the bake-off behind the current choice.

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
  /** Nucleus sampling cutoff. Optional - omitted entirely for older providers (Kimi/DeepSeek/
   * Nemotron never sent it), but Muse Glimmer's own bake-off-verified config (see museGlimmer.ts)
   * uses 0.95, matching NVIDIA's own reference example for this model. */
  topP?: number;
  /** Provider-level timeout in milliseconds. */
  timeoutMs: number;
  /** Kimi K3 and DeepSeek (both tried, both replaced - see types.ts's own history below and the
   * docs addendum) controlled reasoning depth via this enum, under different shapes each time.
   * Unused by the current provider (Nemotron, see nemotron.ts), which uses reasoningBudget below
   * instead. Kept only so the type doesn't need to change again if a future provider uses this
   * same enum-style control. */
  reasoningEffort?: "none" | "low" | "medium" | "high" | "max";
  /** Nemotron's reasoning control - a token budget for the hidden "thinking" pass specifically,
   * separate from `maxTokens` (the combined reasoning+content cap). Keep this notably smaller than
   * maxTokens: DeepSeek's own diagnostic run demonstrated live what happens when reasoning is
   * allowed to consume the *entire* token budget - finish_reason "length" with real content still
   * null. */
  reasoningBudget?: number;
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
  return process.env.NVIDIA_AI_MODEL || "meta/muse-glimmer-30b";
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
  // Fourth model in this config's history (Kimi K3 -> DeepSeek V4 Flash -> Nemotron 3.5 Lightning
  // -> Muse Glimmer 30B) - see museGlimmer.ts's own header comment and docs/AGENTIC_AI.md for the
  // full bake-off that produced this. A 15-run bake-off replication against the exact real
  // production context/prompt/schema measured 15/15 valid JSON, median 14.0s, P95 15.0s, max
  // 15.85s - but the benchmark route makes its own raw fetch calls, bypassing this actual provider/
  // orchestrator path entirely, and the FIRST real live call through this real path timed out at
  // 45s. Median/reliability still look like a real improvement over Nemotron's own real-context
  // baseline (7/15 valid, median 40.1s), but the tail latency claim above is not yet confirmed live
  // - see timeoutMs's own comment below. Nemotron remains registered (see nemotron.ts) - this is a
  // "current best candidate," not a closed decision, pending both further live verification and
  // GLM-5.3-Flash's own replication once Hugging Face's inference credits are restored.
  provider: {
    model: "meta/muse-glimmer-30b",
    // Real observed max across 15 runs was 3696 completion tokens - comfortably under this; not
    // tightened further without more evidence.
    maxTokens: 8192,
    // NOT copied blindly from NVIDIA's own Playground example for this model (which additionally
    // included a generic demo `tools` block unrelated to our task, deliberately not adopted) -
    // empirically confirmed via a controlled bake-off retest, after the same "copy NVIDIA's example
    // verbatim" approach measurably WORSENED two other candidates in the same bake-off (DeepSeek V4
    // Pro got slower/less reliable; Nemotron with reasoning_budget==max_tokens failed completely).
    temperature: 1,
    topP: 0.95,
    // The bake-off's own 15-run replication measured 10.2s-15.85s and 45s was set as a ~3x margin
    // on that - but the FIRST real live production call after this went live timed out at exactly
    // 45s (confirmed via Vercel logs: "NVIDIA request timed out after 45000ms"), contradicting that
    // sample. Same pattern seen earlier this session with Nemotron: a controlled benchmark's context
    // understated real production context's tail latency. Bumped back to 90s (matching Nemotron's
    // own long-standing, well-tested margin) as a safety net while more real production calls are
    // gathered - not yet re-tightened, pending that evidence.
    timeoutMs: 90_000,
    // Muse Glimmer has no reasoning_budget/chat_template_kwargs shape (unlike Nemotron) - plain
    // OpenAI-compatible chat completion, no hidden "thinking" pass to control.
  },
};
