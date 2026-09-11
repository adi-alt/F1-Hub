import { z } from "zod";

export const SeasonStorySchema = z.object({
  headline: z.string(),
  summary: z.string(),
  themes: z.array(z.string()).optional(),
});

export const BattleInsightSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  highlightedBattleId: z.string().optional(),
});

export const ProgressionInsightSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  highlightedEntities: z.array(z.string()).optional(),
});

export const RecordInsightSchema = z.object({
  headline: z.string(),
  summary: z.string(),
  highlightedRecordIds: z.array(z.string()).optional(),
});

export const WhatChangedInsightSchema = z.object({
  summary: z.string(),
  highlights: z.array(z.string()).optional(),
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

export function validateSeasonIntelligence(data: unknown, validIds: string[]): { valid: boolean; data?: SharedSeasonIntelligence; errors?: unknown } {
  try {
    const parsed = SharedSeasonIntelligenceSchema.parse(data);
    // Validate referenced IDs against the deterministic context
    if (parsed.battleInsight.highlightedBattleId && !validIds.includes(parsed.battleInsight.highlightedBattleId)) {
       throw new Error(`highlightedBattleId ${parsed.battleInsight.highlightedBattleId} not in valid IDs`);
    }
    if (parsed.progressionInsight.highlightedEntities) {
       for (const id of parsed.progressionInsight.highlightedEntities) {
         if (!validIds.includes(id)) throw new Error(`highlightedEntity ${id} not in valid IDs`);
       }
    }
    if (parsed.recordInsight.highlightedRecordIds) {
       for (const id of parsed.recordInsight.highlightedRecordIds) {
         if (!validIds.includes(id)) throw new Error(`highlightedRecordId ${id} not in valid IDs`);
       }
    }
    return { valid: true, data: parsed };
  } catch (err) {
    return { valid: false, errors: err };
  }
}
