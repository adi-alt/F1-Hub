// Which homepage-intelligence cache tier a generation is written to, and from what context (audit
// AI-02, M0 Batch 3).
//
// The GLOBAL tier (buildGlobalCacheKey) is read by every anonymous visitor and by every signed-in
// user with no personal state (route.ts step 5). It may therefore only hold output generated from a
// context that contains nothing about any one user. Nulling the personal output FIELDS afterwards
// (stripPersonalFields) is not enough on its own: a model that was shown a private community's post
// titles, a user's favourites or their pick can repeat any of it in a shared field (raceBrief,
// communityPulse, ...), and stripping cannot see that. The route used to do exactly that - generate
// once from the requesting user's full context and write a stripped copy to the global tier.
//
// Rule, by construction:
// - global tier  <- generated from toSharedHomepageContext() only (then also stripped, as a second
//                   line of defence against a model inventing personal sections);
// - personal tier <- generated from the user's full context, keyed by their user id and every input
//                   that can change what they are allowed to see (favourites, pick, predictions,
//                   community memberships - see personalHomepageVersionParts).
// A personalised generation is never written to the global tier.

import type { HomepageContextData } from "@/lib/ai/context";

/** Part of every homepage cache key. Bumped with this change so that global-tier entries written by
 * the old code - which could carry a user's personal content - become unreachable the moment the new
 * code is deployed, instead of being served until they expire. */
export const HOMEPAGE_CACHE_TIER_VERSION = "tiers-v2";

/** Only the fields every visitor shares. Built as an allow-list on purpose: a personal field added
 * to HomepageContextData later stays out of the shared context until someone adds it here. */
export function toSharedHomepageContext(ctx: HomepageContextData): HomepageContextData {
  return { race: ctx.race, standings: ctx.standings, trackHistory: ctx.trackHistory, model: ctx.model, simulation: ctx.simulation };
}

export type HomepageGenerationPlan = {
  tier: "global" | "personal";
  /** The key this generation is single-flighted on and written to - and ONLY this key. */
  cacheKey: string;
  context: HomepageContextData;
};

/** Anonymous visitors and signed-in users with no personal state share the global generation (and
 * its single-flight); everyone else gets a personal generation stored under their own key. */
export function planHomepageGeneration(input: {
  personalCacheKey: string | null;
  globalCacheKey: string;
  isDefaultUser: boolean;
  context: HomepageContextData;
}): HomepageGenerationPlan {
  if (!input.personalCacheKey || input.isDefaultUser) {
    return { tier: "global", cacheKey: input.globalCacheKey, context: toSharedHomepageContext(input.context) };
  }
  return { tier: "personal", cacheKey: input.personalCacheKey, context: input.context };
}

/** Everything a signed-in user's personal entry depends on that can change what they may see.
 * Community memberships are part of it because the personal context carries post titles from the
 * user's joined communities (listFeedPosts "following"): leaving, being removed from or banned from
 * a private community must stop that community's posts being served from cache immediately, not
 * when the entry's TTL runs out. */
export function personalHomepageVersionParts(input: {
  globalDataVersion: string;
  userId: string;
  favoriteDrivers: string[];
  favoriteTeams: string[];
  favoriteTracks: string[];
  pickSubmittedAt: string | null | undefined;
  totalPredictions: number | null | undefined;
  joinedGroupIds: string[];
}): (string | number | null | undefined)[] {
  return [
    input.globalDataVersion,
    input.userId,
    [...input.favoriteDrivers].sort().join(","),
    [...input.favoriteTeams].sort().join(","),
    [...input.favoriteTracks].sort().join(","),
    // Raw (unsorted) [0] as well: a pure reorder changes the "primary" favourite without changing
    // the sorted set (see route.ts's own comment).
    input.favoriteDrivers[0] ?? "",
    input.favoriteTeams[0] ?? "",
    input.pickSubmittedAt,
    input.totalPredictions,
    `groups:${[...input.joinedGroupIds].sort().join(",")}`,
  ];
}
