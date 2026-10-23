# The AI layer

How Apex F1 Hub uses language models today. The code is in `src/lib/ai/` and the routes in
`src/app/api/ai/`. The rule everything follows: **the app computes, the model explains.** Standings,
predictions, probabilities, diffs and every number shown come from deterministic code and the ML
pipeline; the model only turns facts it is handed into prose, and every surface works without it.

## Surfaces

| Route | Agent type | What it writes | Cached |
|---|---|---|---|
| `POST /api/ai/homepage-intelligence` | `homepage_intelligence` | The home page brief: race brief, community pulse, next actions, "since last visit" | yes: global and personal tiers |
| `POST /api/ai/ask-apex` | `ask_apex` | One-turn answers grounded in the home brief the client already has | no |
| `POST /api/ai/race-intelligence` | `race_intelligence` | A race's insights, each citing evidence ids | yes, per race and data version |
| `POST /api/ai/season-intelligence` | `season_intelligence` | Season take | yes |
| `POST /api/ai/season-compare` | `season_compare` | Comparison of selected drivers or teams | yes |
| `POST /api/ai/race-event-take` | `season_race_take` | A take on one race in the season view | yes |
| `POST /api/ai/circuit-take` | `circuit_take` | A circuit's take | yes |
| `POST /api/ai/compose-assist` | (none) | Rewrites the viewer's own draft post. Never cached or shared | no |

`/api/circuits/insights` is deterministic (no model). Signed-out visitors can use the home and race
surfaces (anonymous, IP-limited); the others need a session (`src/app/__tests__/apiAuthMatrix.test.ts`).

## Request flow

1. **Guard** (`guardrails.ts`): `AI_DISABLED` short-circuits to deterministic content. A durable quota
   in Postgres (burst limit and daily budget per user, an IP limit for anonymous callers) holds across
   serverless instances. User text is sanitised (`sanitizePromptInput`).
2. **Cache** (`cache.ts`): an in-memory L1 in front of the `ai_cache` table, keyed by a data-version
   fingerprint, so a cached answer is dropped when the data under it changes. The home page has a
   GLOBAL tier generated only from context with nothing about any user, and a PERSONAL tier
   (`homepageCacheTiers.ts`); personal output is never written to the shared tier. Concurrent misses
   for one key share one generation (single-flight per instance).
3. **Context** (`context/`, `context.ts`, `sinceLastVisit.ts`): built by code from the database. Facts
   carry ids (`evidenceFacts`); the prompt gets facts, not raw tables, and community text is treated
   as untrusted data, never instructions (`prompts/`).
4. **Provider** (`providerFallback.ts`): Groq `openai/gpt-oss-120b` first; on a 5xx, network error or
   timeout one jittered retry on Groq; on 429 or a second failure, OpenRouter `openai/gpt-oss-20b`.
   A per-instance requests-per-minute ceiling (`providerRateLimiter.ts`, `AI_PROVIDER_RPM_LIMIT`,
   default 40) refuses before calling. Each feature can use its own provider accounts (per-feature
   `GROQ_*_API_KEY` / `OPENROUTER_*_API_KEY`, falling back to `GROQ_API_KEY` / `OPENROUTER_API_KEY`), so
   one feature's traffic can't exhaust another's quota. Models are called without tools: the context is
   assembled up front. (`tools/index.ts` is an allowlisted tool registry kept for its safety tests; no
   route passes tools to a model.)
5. **Validate** (`schemas/`, `orchestrator.ts`): the JSON is extracted (`cleanJsonOutput`), checked
   against the surface's schema, and every cited evidence id must exist in that request's facts.
   Personal fields are checked separately from shared ones.
6. **Fall back** (`fallback.ts`): rate limit, kill switch, timeout, provider error, empty output,
   unparseable JSON or a failed validation all serve deterministic content built from the same facts,
   marked `isFallback` with a reason. A user never sees an error for an AI failure.
7. **Log** (`telemetry.ts`, `errorCategory.ts`): one structured JSON line per operation (request id,
   agent, provider, model, prompt version, data version, duration, tokens, cache hit, fallback reason,
   error category). No keys, prompts or post content; user ids are HMAC-hashed.

## Operating it

- **Turn it off:** `AI_DISABLED=1` in Vercel, redeploy. Everything keeps working on deterministic content.
- **Keys:** see the README's environment table. Without any key every surface serves its fallback.
- **Changing provider:** implement `AIProvider` (`provider.ts`) in one file, register it, and point
  `getDefaultProvider()` / `getFallbackProvider()` at it. Groq was chosen in September 2026 on a live
  benchmark of this app's structured-JSON workload (median about 1.7 s; the NVIDIA-hosted models used
  before it took 14 s to 90 s and timed out in production). Those providers and the debug and benchmark
  routes that called them are deleted; `debugRoutesRemoved.test.ts` keeps them out.
- **Tests:** `src/lib/ai/__tests__/` covers the kill switch, cache isolation between users and tiers,
  provider deadlines, prompt-injection handling and the evidence checks.
