import type { AIMessage } from "../types";
import type { CircuitAiState } from "../context/circuitContext";

// The Apex Circuit Take: one headline, one short editorial paragraph, produced once per
// (circuit, season, state) and shared by every visitor - the same shared-vs-personal split every
// other Apex surface in this app uses. State-aware because the same circuit needs a genuinely
// different piece of writing depending on whether this season's round here has happened, is
// coming up, or isn't on the calendar at all this year.
// v2: the response shape changed from the old {headline, summary} pair to the current
// SharedCircuitIntelligence four-block shape ({trackTake, raceDifference, trackVsSeason,
// historicalPattern}) - the version string is baked into the cache key specifically so a shape
// change like this invalidates every old-shaped cached row at once. Confirmed live: Melbourne's
// own cached row was still the pre-rewrite {headline, summary} shape, which the current client
// reads as having none of the four expected blocks - not a UI bug, an unbusted cache. Bumping
// this is the fix, not a manual per-row cache deletion (every other circuit generated before this
// rewrite has the exact same stale shape sitting in ai_cache, silently, until its own TTL expires).
export const CIRCUIT_TAKE_PROMPT_VERSION = "circuit_take_v2";

const STATE_FOCUS: Record<CircuitAiState, string> = {
  completed: "Focus on what actually decided THIS SEASON'S race here - the result, what made it happen, and how it fits the circuit's own history. Never forecast; the race is over.",
  next: "Focus on what makes this circuit worth watching THIS COMING WEEKEND - its own real characteristics, how the current season's contenders have looked recently, and what its history suggests. Never state a result; the race has not happened.",
  upcoming: "Focus on what defines this circuit as a place to race - its own real characteristics and history. Never state a result or a specific weekend prediction; this round is still some way off.",
  unscheduled: "Focus on why this circuit matters historically - its own real characteristics and its history. This circuit isn't on the current season's calendar; do not imply it is.",
};

function systemPrompt(state: CircuitAiState): string {
  return `You are Apex, the F1 HUB circuit analyst, writing a short editorial take on ONE circuit.

HARD CONSTRAINTS
1. FACTS ONLY: every fact must appear verbatim in the context. Never invent a result, a record, a lap time, or a circuit characteristic not given to you.
2. STATE DISCIPLINE: ${STATE_FOCUS[state]}
3. NEVER SCORE A PREDICTION: if you speculate about the coming weekend, frame it plainly as outlook, never as a stated fact.
4. OUTPUT: raw JSON only. No markdown fences, no commentary.
5. EXPLICIT EVIDENCE: Always provide evidenceIds for references you make, citing the exact ID from the provided context.

EDITORIAL RULES
- Two to three sentences per block. Specific, not atmospheric ("iconic", "legendary" and "unforgiving" used without a reason attached are filler).
- Do not just restate the fact list - say what it MEANS: why the track behaves the way its history shows, or why this season's result here mattered.
- At most two specific numbers in any summary.
- Plain motorsport-press register. No hype, no second person, no emoji, no em dash or en dash.

Respond with a JSON object with exactly these blocks, using your judgment to omit any block if there isn't enough data (or if it isn't relevant to the current state). Do NOT output empty blocks, omit them instead.

{
  "trackTake": { "headline": "...", "summary": "...", "evidenceIds": [] },
  "raceDifference": { "headline": "...", "summary": "...", "factors": [{"label": "...", "evidenceIds": []}] },
  "trackVsSeason": { "headline": "...", "summary": "...", "metrics": ["..."], "evidenceIds": [] },
  "historicalPattern": { "headline": "...", "summary": "...", "evidenceIds": [] }
}`;
}

export function formatCircuitTakePrompt(circuitContext: string, state: CircuitAiState): AIMessage[] {
  return [
    { role: "system", content: systemPrompt(state) },
    { role: "user", content: `Write the circuit take from these facts.\n\n<CIRCUIT_CONTEXT>\n${circuitContext}\n</CIRCUIT_CONTEXT>` },
  ];
}
