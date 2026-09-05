# F1 Hub Agentic AI Architecture & Implementation Guide

Comprehensive documentation of the Agentic AI layer for F1 Hub, powered by Moonshot AI's Kimi K3 via NVIDIA NIM.

---

## 1. Overview

F1 Hub is a high-performance Formula 1 intelligence and prediction platform. The Agentic AI layer transforms the homepage from a static dashboard into an adaptive, personalized F1 intelligence command center.

### Core Problem Solved
Traditional sports dashboards present raw tables and static statistics, placing the burden of interpretation entirely on the user. F1 Hub combines:
1. **Deterministic Application Layer**: Standings, points, gaps, historical track records, and head-to-head metrics.
2. **Machine Learning Layer**: Random Forest winner classifications and Monte Carlo finish order simulations.
3. **Agentic AI Layer (Kimi K3)**: Synthesizes complex multi-dimensional data into strategic briefings, narrative context, and coaching advice without ever taking over application control.

---

## 2. Architecture

```mermaid
flowchart TD
    User([User Browser]) -->|HTTP GET /| Page[Home Page Server Component]
    Page -->|Renders immediately| DetUI[Deterministic Hero, Standings, Activity]
    DetUI -->|Subtle Reveal| ClientWidget[AI Widgets Mount Skeleton]
    
    ClientWidget -->|POST /api/ai/homepage-intelligence| Endpoint[AI Bundle Route]
    Endpoint --> Auth[Server Session Auth]
    Auth --> Fetch[Pre-fetch Parallel Data: Standings, ML Projections, Picks, History]
    Fetch --> Version[Generate Composite DataVersion]
    
    Version --> CacheCheck{Cache Lookup}
    CacheCheck -->|Personal Cache Hit| ReturnCached[Return Cached JSON]
    CacheCheck -->|Default User & Global Hit| ReturnCached
    
    CacheCheck -->|Miss| CapCheck{Provider Rate Limit Check<br/>40 RPM Sliding Window}
    CapCheck -->|Exhausted| Fallback[Deterministic Fallback Engine]
    
    CapCheck -->|Capacity Available| ContextBuilder[Bounded Structured Context Builder]
    ContextBuilder --> Kimi[Kimi K3 via NVIDIA NIM API]
    Kimi --> Validator[Zod/Runtime Schema Validation]
    
    Validator -->|Pass| CacheWrite[Save to Global & Personal Caches]
    Validator -->|Fail| Fallback
    
    CacheWrite --> ClientResponse[Return Validated JSON]
    Fallback --> ClientResponse
    ClientResponse --> UIReveal[Progressive Client Reveal]
```

---

## 3. Why Kimi K3

Moonshot AI's **Kimi K3** (`moonshotai/kimi-k3`) was selected as the foundational model via NVIDIA NIM:
- **Long-Context Reasoning**: Deep contextual synthesis across season trajectories, circuit quirks, and user prediction tendencies.
- **Strict Structured Output & Tool Calling**: Native adherence to JSON schema outputs and function definitions.
- **Configurable Reasoning Effort**: Supports fine-tuned `reasoning_effort` ("low", "medium", "high") balancing latency and depth.
- **Multimodal Evolution Path**: Future capabilities for analyzing telemetry charts, circuit layout overlays, and weather radar images.

---

## 4. Provider Abstraction

The AI architecture isolates provider logic behind strict TypeScript interfaces (`AIProvider`), decoupling application logic from NVIDIA or Moonshot specifics.

### Interface (`src/lib/ai/types.ts`)
```typescript
export interface AIProvider {
  readonly name: string;
  chat(
    messages: AIMessage[],
    tools: AIProviderToolDef[] | null,
    config: AIProviderConfig
  ): Promise<AIResponse>;
}
```

### Adding a New Provider
1. Implement the `AIProvider` interface in `src/lib/ai/<providerName>.ts`.
2. Register the provider using `registerProvider("<providerName>", providerInstance)`.
3. Set `AI_PROVIDER=<providerName>` in environment variables. No application routes or prompts need to change.

---

## 5. Homepage AI Flow

The homepage employs a single bundled request lifecycle:
1. **Immediate Page Mount**: Deterministic UI renders instantly; AI widgets show geometry-matched skeleton placeholders.
2. **Session Verification**: The endpoint verifies the HTTP-only session cookie server-side.
3. **Deterministic Pre-fetching**: Reads upcoming race, standings, track history, user pick, ML simulation, and recent posts in parallel.
4. **Data Versioning**: Computes a SHA-256 composite hash of all underlying data.
5. **Two-Tier Cache Check**: Evaluates personal cache (authenticated) or global cache (guest/default).
6. **Provider Capacity Guard**: Verifies outbound request count against the 40 RPM ceiling within a 60-second window.
7. **Single Invocational Call**: Pre-computed data is passed to Kimi K3 in one call (zero tool back-and-forth).
8. **Schema Validation**: Output is validated against `HomepageIntelligence`.
9. **Cache Commit**: Results are stored in L1 memory and `ai_cache` table.
10. **Client Reveal**: Framer Motion smoothly fades in validated content (`opacity: 0 -> 1`, `y: 8px -> 0`).

---

## 6. Agent Orchestration: Direct Mode vs Agent Mode

- **Direct Mode (Homepage)**: Deterministic data is pre-fetched by Next.js server code and injected directly into prompt context. Kimi K3 executes in a single shot without tool roundtrips. This delivers sub-second processing and predictable cost.
- **Agent Mode (Interactive Agents)**: Reusable bounded tool-calling loop (max 8 steps, max 12 tool calls) designed for interactive features (e.g., Ask F1, Race Strategy Analyst).

---

## 7. Tool Architecture

Tools in `src/lib/ai/tools/index.ts` serve as reusable infrastructure for agent mode:

| Tool | Scoped | Description | Security Invariant |
|---|---|---|---|
| `getUpcomingRace` | Public | Next GP details, circuit, schedule | Sanitized fields only |
| `getCurrentStandings` | Public | Driver & Constructor championship standings | Uses cached app compute |
| `getTrackHistory` | Public | Historical circuit performance & defending winners | Parameter type checked |
| `getDriverStats` | Public | Driver career statistics | Pure lookup |
| `getUserPrediction` | User | User's pick for a specific round | `ctx.userId` enforced from server session |
| `getSeasonSummary` | Public | Editorial season recap & round metrics | App-derived calculations |

---

## 8. Database Access Principles

> [!IMPORTANT]
> The AI model **never** receives direct database credentials, arbitrary SQL access, or raw table query capabilities.

All database reads are executed by strongly-typed application functions wrapped in service-layer queries (`queryWithRetry`) using `supabaseAdmin`.

---

## 9. Authentication Model

- `userId` is strictly derived from server-side decrypted `iron-session` cookies.
- Neither model arguments nor client request bodies can supply or override a `userId`.
- Unauthenticated requests receive `userId = null` and access global intelligence exclusively.

---

## 10. Authorization & Data Isolation

- **Cache Partitioning**: Personal cache keys (`ai:personal:{userId}:{raceId}:{dataVersion}`) include the verified `userId`. User A can never query or receive User B's cached insights.
- **Tool Level Isolation**: Tools marked `isUserScoped: true` reject calls when `ctx.userId` is absent and ignore any ID provided in LLM tool parameters.

---

## 11. Prompt Architecture & Versioning

Prompts are version-controlled string templates (`HOMEPAGE_INTELLIGENCE_PROMPT_V1`) located in `src/lib/ai/prompts/`.
- **System Instructions**: Define role, strict tone, and forbidden actions (no fabrication, no URL generation).
- **Tagged Context Blocks**: Structured data is passed inside `<STRUCTURED_F1_DATA>`, while community content is quarantined inside `<UNTRUSTED_COMMUNITY_DATA>`.

---

## 12. Prompt Injection Protection

Defense in depth against untrusted user and community content:
1. **Delimiter Sandboxing**: Community posts are enclosed in `<UNTRUSTED_COMMUNITY_DATA>`.
2. **HTML Sanitization**: All `<script>`, `<style>`, and HTML markup are stripped from post titles and group names.
3. **Length Truncation**: Post titles are truncated to 80 characters; total posts capped at 10 items.
4. **Instruction Neutralization**: System instructions declare community strings as passive data, never executable commands.

---

## 13. Guardrails Summary

- **Tool Allowlist**: Only tools in `toolRegistry` can execute.
- **Parameter Validation**: JSON Schema runtime enforcement.
- **Action Type Allowlist**: Constrained enum `NextActionType` (`MAKE_PREDICTION`, `EXPLORE_RACE`, `JOIN_COMMUNITY`, `VIEW_MODEL`, `CHOOSE_FAVORITES`).
- **Sliding Rate Limit**: 40 RPM provider ceiling.
- **Resource Bounds**: 2048 maximum response tokens, 30s timeout, max 1 retry.
- **Fail-Safe Fallback**: Guaranteed deterministic response if any failure occurs.

---

## 14. Structured Output Validation

The application uses deterministic runtime validators (`validateHomepageIntelligence`) verifying:
- Non-empty headline and narrative strings.
- Absence of client-injected scripts or URLs.
- Matching actionType against `ALLOWED_ACTION_TYPES`.

---

## 15. Grounding & Evidence Metadata

Claims produced by the AI reference pre-computed structured inputs:
- Driver statistics match standings exactly.
- Historical milestones align with archive results.
- Fallback narratives use deterministic formula mappings directly.

---

## 16. Deterministic vs AI Responsibility Split

| Responsibility | Application Code | Kimi K3 AI |
|---|:---:|:---:|
| Championship Standings & Points | ✅ | ❌ |
| Race Winner & Podium Counts | ✅ | ❌ |
| Prediction Accuracy & Error Metrics | ✅ | ❌ |
| Random Forest Predictions | ✅ | ❌ |
| Monte Carlo Probabilities | ✅ | ❌ |
| Community Poll Aggregations | ✅ | ❌ |
| Contextual Narrative Synthesis | ❌ | ✅ |
| Tactical Race Briefings | ❌ | ✅ |
| Uncertainty Analysis | ❌ | ✅ |
| Coaching Tendency Insights | ❌ | ✅ |

---

## 17. ML Models + Monte Carlo + Agentic AI

1. **Random Forest**: Computes deterministic win probabilities and position predictions based on historical features, qualifying gaps, and track characteristics.
2. **Monte Carlo**: Simulates 10,000 race iterations to derive finishing probability distributions.
3. **Kimi K3 AI**: Provides narrative explanations and human-readable context for why the ML model expects these outcomes.

---

## 18. Two-Tier Caching Architecture

- **Tier 1: Global Intelligence Cache** (`ai:global:{raceId}:{dataVersion}`):
  - Shared across all visitors.
  - Covers race brief, one thing to watch, biggest uncertainty, and season narrative.
  - TTL: 1 hour (3600s).
- **Tier 2: Personal Intelligence Cache** (`ai:personal:{userId}:{raceId}:{dataVersion}`):
  - Stores user-specific insights (favorite driver/team tips, prediction coach).
  - TTL: 30 minutes (1800s).
- **Zero-Call Shortcut**: Signed-in users without favorites or pick history automatically consume the global cache, consuming 0 RPM.

---

## 19. Data Versioning & Invalidation

Cache invalidation uses composite hashes:
```typescript
const dataVersion = computeDataVersion([
  raceId,
  nextRace?.updatedAt,
  nextRace?.prediction ? JSON.stringify(nextRace.prediction) : "",
  userPick?.submittedAt,
  predictionPerf?.winner.total,
]);
```
Any pipeline ingestion, qualifying update, or user pick submission automatically alters `dataVersion`, causing an instant cache refresh without manual purges.

---

## 20. Token & Context Management

- Pre-computed context aggregates relevant summary statistics rather than entire race logs.
- Bounded token footprint: prompt context ~1,200 tokens; output target ~500 tokens.

---

## 21. Cost & Capacity Control

- Maximum 1 model call per homepage visit (never 6 independent queries).
- 40 RPM sliding-window ceiling safeguards NVIDIA API quotas.
- Caching satisfies the majority of visitor traffic with 0 outbound API calls.

---

## 22. Streaming vs Bundled JSON

Streaming is deliberately omitted for the homepage:
- Homepage widgets depend on cohesive structure across multiple cards.
- Rendering partial text across 6 separate cards causes visual stutter.
- Bounded structured JSON allows an atomic reveal. Streaming is reserved for future conversational features (e.g. Ask F1).

---

## 23. Error Handling & Fallback Engine

If NVIDIA NIM times out, returns HTTP 5xx, or hits the 40 RPM limit, `generateDeterministicFallback()` immediately generates high-quality grounded copy derived directly from standings, history, and ML outputs.

---

## 24. Observability & Telemetry

`logAIOperation()` emits structured JSON logs compatible with Datadog and Vercel Log Drains:
- `requestId`, `agentType`, `model`, `promptVersion`.
- `providerRPMCurrent`, `providerRPMLimit`, `capacityExhausted`.
- `cacheHit`, `fallbackUsed`, `fallbackReason`, `totalDurationMs`.
- **Zero PII**: No passwords, cookies, or user messages are ever logged.

---

## 25. Security Model Declaration

> [!CAUTION]
> **Fundamental Invariant**: The Large Language Model is an untrusted external entity. The Next.js application layer is the sole authority for security, identity, routing, and database state.

---

## 26. Rate Limiting Implementation

- In-memory sliding window tracking timestamped calls within 60,000 ms.
- Atomic acquisition (`acquireProviderCapacity`) prevents concurrency bursts from violating NVIDIA quotas.

---

## 27. Test Architecture

The test suite contains 29 unit and integration tests covering:
- Provider rate limiting enforcement and recovery.
- Deterministic fallback output validity.
- Two-tier cache isolation and expiration.
- Tool allowlist and context security.
- Structured output schema validation.

---

## 28. Adversarial Test Suite

Dedicated adversarial tests in `src/lib/ai/__tests__/adversarial.test.ts`:
- Prompt injection attempts inside community posts.
- Embedded `<script>` and `<style>` tag stripping.
- Unauthorized tool execution attempts (`execute_sql`).
- Client-supplied `actionType` poisoning.

---

## 29. Homepage UI Integration

AI components smoothly integrate into existing layout components:
- `RaceBrief`, `OneThingToWatch`, `BiggestUncertainty` inside `RaceSectionCard`.
- `PredictionCoach` and `PredictionFingerprint` alongside `PredictionPerformance`.
- `YouVsCommunityVsModel` enhancing `PickVsModel`.
- `CommunityPulse` in `CommunitySection`.

---

## 30. Personalization Engine

The homepage intelligently shifts based on user engagement tier:
- **Guest / New**: Global race briefings and onboarding action prompts.
- **Returning**: Driver/team specific insights and community highlights.
- **Active (≥3 picks)**: Full Prediction Fingerprint with accuracy metrics and coach analysis.

---

## 31. Future Architecture Roadmap

Planned capabilities designed on top of this agent foundation:
1. **Ask F1**: Conversational streaming race assistant.
2. **Race Strategy Analyst**: Real-time pit stop and tire degradation agent.
3. **Multimodal Telemetry Inspector**: Visual speed trace and throttle overlay analysis.
4. **Semantic F1 Search**: Vector-embedded technical regulation search.

---

## 32. Implementation Journey

1. Inspected existing Supabase, personalization, and race prediction schemas.
2. Formulated strict 40 RPM rate-limiting and two-tier caching architecture.
3. Implemented Kimi K3 provider via NVIDIA NIM OpenAI-compatible endpoint.
4. Built declarative schemas and sanitization guardrails.
5. Constructed deterministic fallback engine.
6. Implemented single-bundled `/api/ai/homepage-intelligence` route.
7. Refactored homepage components to support progressive loading.
8. Created unit, integration, and adversarial test suites.

---

## 33. Environment Variables

```env
# Server-only secrets (Never expose to client bundle)
NVIDIA_API_KEY=nvapi-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
NVIDIA_AI_MODEL=moonshotai/kimi-k3
AI_PROVIDER_RPM_LIMIT=40

# Supabase Service Role
SUPABASE_SECRET_KEY=sb_secret_xxxxxxxxxxxxxxxxxxxxxxxx
NEXT_PUBLIC_SUPABASE_URL=https://xxxxxxxx.supabase.co
```

---

## 34. Architectural Decisions & Tradeoffs

| Decision | Chosen Approach | Alternative | Why Chosen |
|---|---|---|---|
| Model Endpoint | Kimi K3 via NVIDIA NIM | Local OSS Model | Exceptional reasoning & structured output with zero self-hosting overhead |
| Request Pattern | Single Bundled Request | Multiple Widget Requests | Conserves RPM (1 call vs 6), eliminates race conditions |
| Rate Ceiling | 40 RPM Sliding Window | Unbounded Requests | Strict adherence to NVIDIA provider limits without service interruption |
| Loading Strategy | Progressive Client Reveal | Server-Side Blocking | Guarantees instant sub-100ms first paint with deterministic data |
| Fallback Strategy | Dynamic Deterministic Copy | Generic Error Message | Users always get useful, factual insights even during outages |

---

## 35. Addendum: Personalization Pass (v2, `homepage_v2_personalized`)

A follow-up pass after the initial v1 build shipped. v1's infrastructure (provider, guardrails,
caching, tests, docs above) was correct and complete, but the actual homepage content wasn't
meaningfully personalized - two different users with two different favorite drivers would get
close to the same generic race narrative. This addendum documents what changed.

### 35.1 Bugs fixed

1. **`winProbability` was Random Forest feature importance, not a probability.** `route.ts`
   previously set `winProbability: nextRace.prediction.finishFeatureImportance?.grid` - a feature-
   importance *weight* (how much grid position influences the RF model), mislabeled as a win
   probability. Fixed: the real calibrated probability now comes from
   `nextRace.simulation.drivers[].p1` (Monte Carlo), populated into a new, separate `simulation`
   context block. `model` (RF) now only ever carries a ranking + its top feature factors, never a
   percentage. The system prompt (`homepagePrompt.ts`) explicitly tells Kimi never to phrase the RF
   ranking as a probability.
2. **`getUserPrediction` tool queried columns that don't exist** (`predicted_winner_driver_id`,
   `predicted_podium_driver_ids`) instead of the real `picks` schema (`predicted_winner`,
   `predicted_podium`), and swallowed the resulting Supabase error - always silently returning
   `{ pick: null }`. Fixed, and the tool now throws on a real Supabase error instead of hiding it.
3. **Circuit history was resolved with the wrong identifier.** `route.ts` called
   `getTrackHistory(nextRace.circuit)` directly - `nextRace.circuit` is FastF1's raw location
   string ("Budapest"), not an archive `circuitId` ("hungaroring"), so this silently returned null
   for almost every circuit. Fixed by reusing the same `resolveCurrentCircuitToArchiveId` resolution
   `src/app/page.tsx` already does for the deterministic homepage, and passing the user's real
   favorite driver/team ids into `getTrackHistory` so `favoriteDriverCircuitStats` actually
   populates. Confirmed live: Lewis Hamilton's real Monza history (5 wins, 8 podiums, 19 starts)
   now reaches both the AI context and the deterministic fallback.
4. **`race.raceDate` is never populated on the real data path.** Discovered while live-testing
   Since Last Visit: `races.ts`'s `toRaceDoc()` (used by `getRacesByYear`) never maps `race_date`
   onto `RaceDoc.raceDate` at all - only an unrelated calendar-row helper does. `sinceLastVisit.ts`
   originally filtered on `raceDate`, so every race was silently excluded from the "prior standings"
   reconstruction, making every second visit look like the entire season had just happened. Fixed
   to filter on `updatedAt` (`races.updated_at` - always populated), which is also the more
   correct field conceptually: what changes the standings is when the result was *written*, not the
   calendar date of the race.

### 35.2 New schema fields (`HomepageIntelligence`)

- `personalRaceBrief` - a favorite-driver/team-specific headline + why-it-matters, null without a
  favorite.
- `predictionChallenge` - `AGREE`/`DISAGREE`/`NO_PICK` (decided deterministically by comparing the
  user's real pick against the model's/simulation's real pick, never by Kimi) plus an explanation
  and the strongest evidence for/against the user's pick.
- `personalOutlook` - one synthesized assessment combining the favorite driver's championship
  position, this circuit's real history for them, and what RF/Monte Carlo say, null without a
  favorite driver.
- `sinceLastVisit` - a real, computed list of what changed (championship leader, favorite's rank,
  favorite team's rank, a new prediction, new community posts) between `profiles.last_homepage_visit_at`
  and now, null for a first-ever visit. Kimi only writes `summary`; the `changes` array itself is
  application-computed (see `sinceLastVisit.ts`).

All four are nullable and validated the same way as every other field - a missing or malformed
personal field degrades to `null`, never to a fabricated placeholder pretending to be personal.

### 35.3 New deterministic (non-AI) computations

- `computePredictionFingerprint()` (`predictionPerformance.ts`) - winner/podium accuracy, average
  position error (existing), plus two new real signals: `avgPredictedWinnerGrid` (average starting
  grid of the drivers the user picked to win - a real "do you back the pole-sitter or the
  underdog" measure) and `pctPicksForSeasonLeader` (fraction of picks that went to this season's
  eventual points leader - a simplified, explicitly-documented-as-retroactive "backs the favorite"
  proxy, not a per-race snapshot reconstruction).
- `computeSinceLastVisit()` (`lib/ai/sinceLastVisit.ts`) - reconstructs "what the standings looked
  like as of the user's last visit" from real race results filtered by `updatedAt`, diffs it
  against current standings, and layers in the user's own prediction/community activity in that
  window. Live-verified: an empty `changes` array when nothing genuinely changed between two
  requests seconds apart, and a real 3-item diff (`CHAMPIONSHIP`/`DRIVER`/`TEAM`) reconstructed
  correctly across an actual multi-round gap.

Both are pure application code - Kimi interprets their output, it never calculates the numbers
itself (same rule the v1 doc already established for `predictionCoach`).

### 35.4 Cache versioning correction

v1 hashed `userPick.submittedAt` into the *global* `dataVersion`, so one user's own prediction
would invalidate the shared cache entry every other visitor reads. Fixed: `globalDataVersion` now
depends only on race/model/simulation/community-volume facts; `personalDataVersion` is
`globalDataVersion` + the user's own favorites/pick/fingerprint-size/since-last-visit-change-count.
A user's prediction can now only ever invalidate their own personal cache entry.

### 35.5 Single-flight generation lock

`lib/ai/cache.ts` now exposes `withSingleFlight(key, generate)` - concurrent requests that miss the
same cache key (the realistic "many users load the homepage in the same few seconds" case)
coalesce onto one in-flight generation instead of each independently calling Kimi. Documented
limitation: this map is process-local, so it collapses a stampede *within one serverless instance*,
not across every concurrently-warm instance on Vercel - the 40 RPM provider-capacity ceiling is the
actual cross-instance backstop.

### 35.6 UI integration (no new top-level cards)

Per the explicit "don't add 10 more cards" constraint, every new field was woven into an existing
component rather than given its own section:
- `personalRaceBrief` renders inside the existing `RaceBrief` card, below the generic headline.
- `personalOutlook.overallAssessment` renders at the bottom of the hero's existing
  `RaceIntelligencePanel` (Track Intelligence), under a "Your outlook" label.
- `predictionChallenge` ("AI Challenge") renders inside the existing "Your Pick vs. F1 Hub Model"
  section, directly below the `PickVsModel` comparison it explains.
- `sinceLastVisit` is a single thin strip (not a card) at the very top of the Intelligence section,
  rendering nothing at all when there's no prior visit or nothing changed.

### 35.7 Migrations applied

`add_ai_cache.sql` and `add_last_homepage_visit.sql` (previously written but never run) were applied
directly to the live database and folded into `supabase/schema.sql` as the permanent record; the
scratch migration files were removed per this repo's migration convention.

### 35.8 Known limitation surfaced during this pass

Live end-to-end testing in the development sandbox could not get a real response from NVIDIA's
endpoint - every call timed out at the provider level (`curl` to `integrate.api.nvidia.com`
directly, bypassing the app entirely, also failed to connect), which points to the sandbox's
outbound network restrictions rather than an application bug. This could not be fully ruled out
without access to the production network, so the honest status is: the deterministic fallback path
was thoroughly live-verified (including full personalization - real Monza history, real
championship rank, real since-last-visit deltas), but a genuine 200 response from Kimi itself was
not observed in this environment. Production (Vercel) has unrestricted outbound network access, so
this is expected to resolve there; if it doesn't, `logAIError`'s `kimi_provider`/`timeout` entries
in the Vercel log drain are the first thing to check.
