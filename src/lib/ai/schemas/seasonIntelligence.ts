import { z } from "zod";

// `.nullish()` (not `.optional()`) on every optional field below - confirmed live that the model
// reliably emits `null` for a field it considers not applicable rather than omitting the key
// entirely, and plain `.optional()` only accepts `undefined`, rejecting `null` as a type error and
// failing the ENTIRE 5-section response over one harmless field. `.transform` normalizes both
// `null` and `undefined` down to one consistent shape (`[]` for arrays, `undefined` for scalars)
// so nothing downstream has to check for three different "absent" states.
const optionalStringArray = z.array(z.string()).nullish().transform((v) => v ?? []);
const optionalString = z.string().nullish().transform((v) => v ?? undefined);

/** Whether a piece of intelligence was actually written by the model or assembled deterministically
 * when the model was unavailable. The UI degrades seamlessly either way and does NOT badge this at
 * the user - but the application must never internally mistake one for the other (a cached
 * fallback must not be relabelled "llm" later, and telemetry must not count fallbacks as
 * successful generations). */
export type IntelligenceSource = "llm" | "fallback";

export type WithSource<T> = { content: T; source: IntelligenceSource; generatedAt: string };

export const SeasonStorySchema = z.object({
  headline: z.string(),
  summary: z.string(),
  themes: optionalStringArray,
});

export const BattleInsightSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  highlightedBattleId: optionalString,
});

export const ProgressionInsightSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  highlightedEntities: optionalStringArray,
});

export const RecordInsightSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  highlightedRecordIds: optionalStringArray,
});

export const WhatChangedInsightSchema = z.object({
  summary: z.string(),
  highlights: optionalStringArray,
});

export const SharedSeasonIntelligenceSchema = z.object({
  seasonStory: SeasonStorySchema,
  battleInsight: BattleInsightSchema,
  progressionInsight: ProgressionInsightSchema,
  recordInsight: RecordInsightSchema,
  whatChangedInsight: WhatChangedInsightSchema,
});

export type SharedSeasonIntelligence = z.infer<typeof SharedSeasonIntelligenceSchema>;

export const SeasonCompareInsightSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  keyAdvantageA: z.string(),
  keyAdvantageB: z.string(),
  momentum: z.enum(["A", "B", "EVEN"]),
});

export type SeasonCompareInsight = z.infer<typeof SeasonCompareInsightSchema>;

/** The exact selection a compare response was generated for. Echoed back by the route so the
 * client can refuse to render a reply that no longer matches what is on screen - arrival order is
 * never trusted on its own. */
export type CompareIdentity = {
  season: number;
  entityType: "drivers" | "constructors";
  entityA: string;
  entityB: string;
  completedRounds: number;
};

export const RaceEventTakeSchema = z.object({
  headline: z.string(),
  summary: z.string(),
});

export type RaceEventTake = z.infer<typeof RaceEventTakeSchema>;

export const CircuitTakeBlockSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  evidenceIds: optionalStringArray,
});

export const RaceDifferenceBlockSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  factors: z.array(
    z.object({
      label: z.string(),
      evidenceIds: optionalStringArray,
    })
  ).nullish().transform((v) => v ?? []),
});

export const TrackVsSeasonBlockSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  metrics: optionalStringArray,
  evidenceIds: optionalStringArray,
});

export const SharedCircuitIntelligenceSchema = z.object({
  trackTake: CircuitTakeBlockSchema.optional(),
  raceDifference: RaceDifferenceBlockSchema.optional(),
  trackVsSeason: TrackVsSeasonBlockSchema.optional(),
  historicalPattern: CircuitTakeBlockSchema.optional(),
});

export type SharedCircuitIntelligence = z.infer<typeof SharedCircuitIntelligenceSchema>;

/** The model is asked to copy ids "without the brackets", and mostly does - but observed live, it
 * sometimes returns "[ANT]" verbatim from the context instead of "ANT". Every one of those was
 * then silently filtered out as an unknown id, so highlighting never worked at all. Normalizing
 * here rather than relying only on the instruction: prompts are advisory, validators are not. */
function normalizeId(raw: string): string {
  return raw.trim().replace(/^\[|\]$/g, "");
}

/** A bad ID reference (the model citing a battle/entity/record that doesn't exist in this
 * season's real data) is a real correctness issue for whatever UI highlights that ID, but the
 * headline/summary text around it is still perfectly good editorial content - rejecting the
 * WHOLE response over one hallucinated reference threw away four other working sections for one
 * bad pointer. Strips just the offending reference(s) instead. */
export function validateSeasonIntelligence(data: unknown, validIds: string[]): { valid: boolean; data?: SharedSeasonIntelligence; errors?: unknown } {
  const result = SharedSeasonIntelligenceSchema.safeParse(data);
  if (!result.success) return { valid: false, errors: result.error };

  const parsed = result.data;
  const known = new Set(validIds);

  const battleId = parsed.battleInsight.highlightedBattleId ? normalizeId(parsed.battleInsight.highlightedBattleId) : undefined;
  parsed.battleInsight.highlightedBattleId = battleId && known.has(battleId) ? battleId : undefined;

  parsed.progressionInsight.highlightedEntities = parsed.progressionInsight.highlightedEntities.map(normalizeId).filter((id) => known.has(id));
  parsed.recordInsight.highlightedRecordIds = parsed.recordInsight.highlightedRecordIds.map(normalizeId).filter((id) => known.has(id));

  return { valid: true, data: parsed };
}

/** Escapes a string for safe use inside a RegExp (a driver name could in principle contain "."). */
function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** The structural fix for the wrong-pair bug is that the model only ever SEES the two selected
 * entities (see context/seasonContext.ts). This is the second line of defence: a compare response
 * that names a third competitor is rejected outright rather than rendered under the wrong
 * heading, and the caller falls back to the deterministic pair summary - which is, by
 * construction, about the right two.
 *
 * `momentum` is also overwritten with the deterministically computed value rather than trusted:
 * it's a derived fact the UI treats as authoritative, and the model was only ever asked to report
 * it back. */
export function validateSeasonCompareInsight(
  data: unknown,
  expected: { aName: string; bName: string; entityType: "drivers" | "constructors"; momentum: "A" | "B" | "EVEN"; forbiddenNames: string[] },
): { valid: boolean; data?: SeasonCompareInsight; errors?: unknown } {
  const result = SeasonCompareInsightSchema.safeParse(data);
  if (!result.success) return { valid: false, errors: result.error };

  const text = [result.data.headline, result.data.summary, result.data.keyAdvantageA, result.data.keyAdvantageB].join(" \n ");
  const allowed = `${expected.aName} ${expected.bName}`.toLowerCase();

  // For DRIVERS, match the full name AND its surname, because that is how a model actually writes
  // about a third party: "Russell closes in", not "George Russell closes in". Full names alone
  // would miss the most likely phrasing of the exact failure this guards against.
  //
  // For TEAMS, full names ONLY. Splitting a team name on whitespace yields generic words -
  // "Haas F1 Team" gives "Team", "Red Bull Racing" gives "Racing", "Aston Martin" gives "Martin" -
  // and matching those would reject correct copy for using an ordinary noun.
  const needles = new Set<string>();
  for (const name of expected.forbiddenNames) {
    const trimmed = name.trim();
    if (trimmed.length >= 3) needles.add(trimmed);
    if (expected.entityType !== "drivers") continue;
    const surname = trimmed.split(/\s+/).pop() ?? "";
    // 4+ characters, so short particles ("Da", "Van", "Jr") can't trigger a false rejection.
    if (surname.length >= 4) needles.add(surname);
  }

  for (const needle of needles) {
    // Skip anything that is itself part of one of the two selected names (a shared surname, a
    // team name both compete for) - matching on that would reject perfectly correct copy.
    if (allowed.includes(needle.toLowerCase())) continue;
    if (new RegExp(`\\b${escapeRegExp(needle)}\\b`, "i").test(text)) {
      return { valid: false, errors: `Compare response referenced "${needle}", which is not one of the two selected entities.` };
    }
  }

  return { valid: true, data: { ...result.data, momentum: expected.momentum } };
}

export function validateRaceEventTake(data: unknown): { valid: boolean; data?: RaceEventTake; errors?: unknown } {
  const result = RaceEventTakeSchema.safeParse(data);
  if (!result.success) return { valid: false, errors: result.error };
  return { valid: true, data: result.data };
}

export function validateSharedCircuitIntelligence(data: unknown, validIds: string[]): { valid: boolean; data?: SharedCircuitIntelligence; errors?: unknown } {
  const result = SharedCircuitIntelligenceSchema.safeParse(data);
  if (!result.success) return { valid: false, errors: result.error };
  
  const parsed = result.data;
  const known = new Set(validIds);

  const cleanIds = (ids: string[]) => ids.map(normalizeId).filter((id) => known.has(id));

  // Strip invalid blocks deterministically rather than failing entirely
  if (parsed.trackTake) {
    parsed.trackTake.evidenceIds = cleanIds(parsed.trackTake.evidenceIds);
  }
  
  if (parsed.raceDifference) {
    parsed.raceDifference.factors = parsed.raceDifference.factors.map(f => ({
      ...f,
      evidenceIds: cleanIds(f.evidenceIds),
    }));
  }
  
  if (parsed.trackVsSeason) {
    parsed.trackVsSeason.evidenceIds = cleanIds(parsed.trackVsSeason.evidenceIds);
  }
  
  if (parsed.historicalPattern) {
    parsed.historicalPattern.evidenceIds = cleanIds(parsed.historicalPattern.evidenceIds);
  }

  // Do not cache malformed intelligence if ALL blocks are stripped/empty
  if (!parsed.trackTake && !parsed.raceDifference && !parsed.trackVsSeason && !parsed.historicalPattern) {
    return { valid: false, errors: "All blocks stripped or missing." };
  }

  return { valid: true, data: parsed };
}
