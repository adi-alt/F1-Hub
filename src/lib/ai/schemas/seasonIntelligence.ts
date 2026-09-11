import { z } from "zod";

// `.nullish()` (not `.optional()`) on every optional field below - confirmed live that the model
// reliably emits `null` for a field it considers not applicable rather than omitting the key
// entirely, and plain `.optional()` only accepts `undefined`, rejecting `null` as a type error and
// failing the ENTIRE 5-section response over one harmless field. `.transform` normalizes both
// `null` and `undefined` down to one consistent shape (`[]` for arrays, `undefined` for scalars)
// so nothing downstream has to check for three different "absent" states.
const optionalStringArray = z.array(z.string()).nullish().transform((v) => v ?? []);
const optionalString = z.string().nullish().transform((v) => v ?? undefined);

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

export type PersonalSeasonContext = {
  favoriteDriverIds: string[];
  favoriteTeamIds: string[];
};

export const SeasonCompareInsightSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  keyAdvantageA: z.string(),
  keyAdvantageB: z.string(),
  momentum: z.enum(["A", "B", "EVEN"]),
});

export type SeasonCompareInsight = z.infer<typeof SeasonCompareInsightSchema>;

/** A bad ID reference (the model citing a battle/entity/record that doesn't exist in this
 * season's real data) is a real correctness issue for whatever UI highlights that ID, but the
 * headline/summary text around it is still perfectly good editorial content - rejecting the
 * WHOLE response over one hallucinated reference (the previous behavior) threw away four other
 * working sections for one bad pointer. Strips just the offending reference(s) instead. */
export function validateSeasonIntelligence(data: unknown, validIds: string[]): { valid: boolean; data?: SharedSeasonIntelligence; errors?: unknown } {
  const result = SharedSeasonIntelligenceSchema.safeParse(data);
  if (!result.success) return { valid: false, errors: result.error };

  const parsed = result.data;
  if (parsed.battleInsight.highlightedBattleId && !validIds.includes(parsed.battleInsight.highlightedBattleId)) {
    parsed.battleInsight.highlightedBattleId = undefined;
  }
  parsed.progressionInsight.highlightedEntities = parsed.progressionInsight.highlightedEntities.filter((id) => validIds.includes(id));
  parsed.recordInsight.highlightedRecordIds = parsed.recordInsight.highlightedRecordIds.filter((id) => validIds.includes(id));

  return { valid: true, data: parsed };
}
