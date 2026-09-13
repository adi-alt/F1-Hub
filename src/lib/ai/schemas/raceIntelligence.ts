// Race Intelligence Schema & Validation.
// Guarantees strictly validated structure with zero arbitrary HTML/URLs, plus (beyond what the
// homepage schema needs) real evidence-source validation - every cited evidenceId must resolve to
// a fact that actually existed in this race's own RaceIntelligenceContext.evidenceFacts.

import type { ContextSource, EvidenceFact } from "../context/raceContext";

export const CLAIM_TYPES = ["fact", "analysis"] as const;
export type ClaimType = (typeof CLAIM_TYPES)[number];

export interface RaceInsight {
  title: string;
  explanation: string;
  claimType: ClaimType;
  evidenceIds: string[];
}

/** Null (not omitted) when the underlying context genuinely doesn't support this angle - lets the
 * UI say "no strategy insight for this race" honestly instead of guessing why a key is missing. */
export interface AvailableInsight {
  title: string;
  explanation: string;
  available: boolean;
}

export interface SharedRaceIntelligence {
  headline: string;
  executiveSummary: string;
  keyFactors: RaceInsight[]; // 3-4 items
  strategyInsight: AvailableInsight | null;
  racePaceInsight: AvailableInsight | null;
  championshipImpact: AvailableInsight | null;
}

export interface PersonalRaceInsight {
  title: string;
  explanation: string;
  evidenceIds: string[];
}

export interface RaceIntelligenceResult {
  shared: SharedRaceIntelligence;
  personal: PersonalRaceInsight | null;
}

function isNonEmptyString(v: unknown): v is string {
  return typeof v === "string" && v.trim().length > 0;
}

function isValidClaimType(v: unknown): v is ClaimType {
  return typeof v === "string" && (CLAIM_TYPES as readonly string[]).includes(v);
}

/** Cross-checks every evidenceIds entry against the real fact registry for this exact race -
 * proves the citation existed at generation time. Does NOT prove the explanation prose accurately
 * paraphrases the fact - no structural check can guarantee that; this is evidence-*source*
 * validation, not full factual grounding, and isn't oversold as more than that. An id that doesn't
 * resolve is stripped from the array rather than failing the whole factor - a model citing one bad
 * id alongside two real ones shouldn't lose an otherwise-valid insight. */
function sanitizeEvidenceIds(ids: unknown, validFactIds: Set<string>): string[] {
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === "string" && validFactIds.has(id));
}

function validateRaceInsight(input: unknown, validFactIds: Set<string>, errors: string[], path: string): RaceInsight | null {
  if (!input || typeof input !== "object") {
    errors.push(`${path} must be an object`);
    return null;
  }
  const obj = input as Record<string, unknown>;
  if (!isNonEmptyString(obj.title)) errors.push(`${path}.title must be a non-empty string`);
  if (!isNonEmptyString(obj.explanation)) errors.push(`${path}.explanation must be a non-empty string`);
  if (!isValidClaimType(obj.claimType)) errors.push(`${path}.claimType must be "fact" or "analysis"`);
  if (!isNonEmptyString(obj.title) || !isNonEmptyString(obj.explanation) || !isValidClaimType(obj.claimType)) return null;

  return {
    title: obj.title as string,
    explanation: obj.explanation as string,
    claimType: obj.claimType as ClaimType,
    evidenceIds: sanitizeEvidenceIds(obj.evidenceIds, validFactIds),
  };
}

function validateAvailableInsight(input: unknown, errors: string[], path: string): AvailableInsight | null {
  if (input === null) return null;
  if (!input || typeof input !== "object") {
    errors.push(`${path} must be an object or null`);
    return null;
  }
  const obj = input as Record<string, unknown>;
  if (typeof obj.available !== "boolean") {
    errors.push(`${path}.available must be a boolean`);
    return null;
  }
  if (!obj.available) return { title: "", explanation: "", available: false };
  if (!isNonEmptyString(obj.title) || !isNonEmptyString(obj.explanation)) {
    errors.push(`${path}.title/explanation must be non-empty strings when available is true`);
    return null;
  }
  return { title: obj.title as string, explanation: obj.explanation as string, available: true };
}

export function validateRaceIntelligenceResult(
  input: unknown,
  evidenceFacts: EvidenceFact[],
): { valid: boolean; data?: RaceIntelligenceResult; errors?: string[] } {
  const errors: string[] = [];
  const validFactIds = new Set(evidenceFacts.map((f) => f.id));

  if (!input || typeof input !== "object" || Array.isArray(input)) {
    return { valid: false, errors: ["Input must be a non-null object"] };
  }
  const obj = input as Record<string, unknown>;

  if (!obj.shared || typeof obj.shared !== "object") {
    return { valid: false, errors: ["Missing or invalid shared"] };
  }
  const sharedObj = obj.shared as Record<string, unknown>;

  if (!isNonEmptyString(sharedObj.headline)) errors.push("shared.headline must be a non-empty string");
  if (!isNonEmptyString(sharedObj.executiveSummary)) errors.push("shared.executiveSummary must be a non-empty string");

  const keyFactorsRaw = Array.isArray(sharedObj.keyFactors) ? sharedObj.keyFactors : [];
  if (keyFactorsRaw.length === 0) errors.push("shared.keyFactors must be a non-empty array");
  const keyFactors: RaceInsight[] = [];
  keyFactorsRaw.forEach((f, i) => {
    const validated = validateRaceInsight(f, validFactIds, errors, `shared.keyFactors[${i}]`);
    if (validated) keyFactors.push(validated);
  });
  if (keyFactors.length === 0) errors.push("shared.keyFactors had no validly-shaped entries");

  const strategyInsight = validateAvailableInsight(sharedObj.strategyInsight ?? null, errors, "shared.strategyInsight");
  const racePaceInsight = validateAvailableInsight(sharedObj.racePaceInsight ?? null, errors, "shared.racePaceInsight");
  const championshipImpact = validateAvailableInsight(sharedObj.championshipImpact ?? null, errors, "shared.championshipImpact");

  let personal: PersonalRaceInsight | null = null;
  if (obj.personal !== null && obj.personal !== undefined) {
    if (typeof obj.personal !== "object") {
      errors.push("personal must be an object or null");
    } else {
      const p = obj.personal as Record<string, unknown>;
      if (!isNonEmptyString(p.title)) errors.push("personal.title must be a non-empty string");
      if (!isNonEmptyString(p.explanation)) errors.push("personal.explanation must be a non-empty string");
      if (isNonEmptyString(p.title) && isNonEmptyString(p.explanation)) {
        personal = { title: p.title as string, explanation: p.explanation as string, evidenceIds: sanitizeEvidenceIds(p.evidenceIds, validFactIds) };
      }
    }
  }

  if (errors.length > 0 || keyFactors.length === 0) {
    return { valid: false, errors };
  }

  return {
    valid: true,
    data: {
      shared: {
        headline: sharedObj.headline as string,
        executiveSummary: sharedObj.executiveSummary as string,
        keyFactors,
        strategyInsight,
        racePaceInsight,
        championshipImpact,
      },
      personal,
    },
  };
}

/** Validates a personal-only response (see prompts/raceIntelligencePrompt.ts's
 * formatPersonalOnlyPrompt) - the smaller partial-cache-hit path, not the full {shared, personal}
 * shape. */
export function validatePersonalOnlyResult(input: unknown, evidenceFacts: EvidenceFact[]): { valid: boolean; data?: PersonalRaceInsight; errors?: string[] } {
  const errors: string[] = [];
  const validFactIds = new Set(evidenceFacts.map((f) => f.id));
  if (!input || typeof input !== "object") return { valid: false, errors: ["Input must be a non-null object"] };
  const obj = input as Record<string, unknown>;
  if (!obj.personal || typeof obj.personal !== "object") return { valid: false, errors: ["Missing or invalid personal"] };
  const p = obj.personal as Record<string, unknown>;
  if (!isNonEmptyString(p.title)) errors.push("personal.title must be a non-empty string");
  if (!isNonEmptyString(p.explanation)) errors.push("personal.explanation must be a non-empty string");
  if (errors.length > 0) return { valid: false, errors };
  return { valid: true, data: { title: p.title as string, explanation: p.explanation as string, evidenceIds: sanitizeEvidenceIds(p.evidenceIds, validFactIds) } };
}

// Re-exported so callers (orchestrator/route) can build the "N of 8 sources available" count
// without importing the context module's own ContextSource union directly.
export type { ContextSource };
