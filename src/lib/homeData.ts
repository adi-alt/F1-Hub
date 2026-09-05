// The signed-in homepage's own aggregation layer — same role personalization.ts plays for
// favorites/standings, just for the "personal" half of the homepage (see src/app/page.tsx). Reads
// from the Groups data layer (getUserGroups/listPublicGroups/listFeedPosts) but never writes to or
// modifies it — that surface is owned by a concurrent redesign elsewhere in this codebase.

import { getRecentPredictionPolls, type PredictionPoll } from "@/lib/homePredictionPolls";
import { computePredictionPerformance, type PredictionPerformance } from "@/lib/predictionPerformance";
import {
  getFavoriteDriverCard,
  getFavoriteTeamCard,
  type Fact,
  type FavoriteDriverCard,
  type FavoriteTeamCard,
  type SeasonRecap,
  type TrackHistory,
} from "@/lib/personalization";
import { raceHref } from "@/lib/routes";
import type { CalendarEntry } from "@/lib/supabase/calendar";
import { getUserGroups, listPublicGroups, type GroupSummary, type PublicGroupSummary } from "@/lib/supabase/groups";
import { listFeedPosts, type FeedPost } from "@/lib/supabase/groupPosts";
import { getUserPick, getUserPicksForYear } from "@/lib/supabase/picks";
import { listRecentTransactions, type PointsReason } from "@/lib/supabase/points";
import { getUserProfile, type UserProfile } from "@/lib/supabase/users";
import type { RaceDoc, UserPick } from "@/lib/types/race";

/** The auth-independent half of the homepage — real regardless of whether anyone's signed in,
 * since the redesigned signed-out hero needs the exact same upcoming-race context as the
 * signed-in one. Fetched unconditionally in page.tsx (see HomeShell). */
export type PublicHomeData = {
  year: number;
  nextRace: RaceDoc | null;
  races: RaceDoc[];
  calendarEntry: CalendarEntry | null;
  backdropPhotos: string[];
  facts: Fact[];
  /** The upcoming race's circuit history — null for a circuit the archive doesn't cover at all.
   * Drives the hero's right-side Race Intelligence panel and the Track Intelligence widget. */
  trackHistory: TrackHistory | null;
  seasonRecap: SeasonRecap;
};

// A homepage teaser, not a second Groups feed — same cap FavoritesSection/GroupsPreview already
// used for the equivalent reason.
const FEED_POST_LIMIT = 5;
const RECENT_TRANSACTIONS_LIMIT = 5;
const RECENT_ACTIVITY_LIMIT = 5;
const DISCOVER_GROUPS_LIMIT = 3;
const ACTIVE_TIER_MIN_PICKS = 3;
const COMMUNITY_ACTIVITY_WINDOW_DAYS = 7;

export type PersonalizationTier = "new" | "returning" | "active";

export type NextAction = { section: "hero" | "yourF1" | "community"; label: string; href: string };

export type PersonalHomeData = {
  profile: UserProfile | null;
  favoriteDriver: FavoriteDriverCard | null;
  favoriteTeam: FavoriteTeamCard | null;
  groups: GroupSummary[];
  /** Only populated when `groups.length === 0` — recommended public groups the user hasn't
   * joined, for the "Your Community" section's discovery fallback. */
  discoverGroups: PublicGroupSummary[];
  feedPosts: FeedPost[];
  /** The user's pick for `nextRace`, if any — the "your pick" half of PickVsModel. */
  myPick: UserPick | null;
  predictionPerformance: PredictionPerformance;
  recentActivity: ActivityEntry[];
  predictionPolls: PredictionPoll[];
  tier: PersonalizationTier;
  nextAction: NextAction | null;
};

export type ActivityEntry = { key: string; timestamp: string; text: string };

const TRANSACTION_LABEL: Record<PointsReason, string> = {
  starting_grant: "your starting points grant",
  prediction_entry: "entering a prediction",
  prediction_payout: "a prediction payout",
  prediction_refund: "a prediction refund",
};

/** Real, timestamped events only — a pick submission (UserPick.submittedAt) and a points ledger
 * entry (points_transactions) — merged and sorted, never a fabricated activity log (there is no
 * such table; see groups.ts's own comment on why one was deliberately not invented). */
function buildRecentActivity(picks: UserPick[], races: RaceDoc[], transactions: { amount: number; reason: PointsReason; createdAt: string }[]): ActivityEntry[] {
  const raceNameById = new Map(races.map((r) => [r.id, r.name]));
  const fromPicks: ActivityEntry[] = picks.map((p) => ({
    key: `pick-${p.raceId}`,
    timestamp: p.submittedAt,
    text: `You predicted ${p.predictedWinner} to win at ${raceNameById.get(p.raceId) ?? "a race"}`,
  }));
  const fromTransactions: ActivityEntry[] = transactions.map((t, i) => ({
    key: `txn-${i}-${t.createdAt}`,
    timestamp: t.createdAt,
    text: t.amount >= 0 ? `You earned ${t.amount} points from ${TRANSACTION_LABEL[t.reason]}` : `You spent ${Math.abs(t.amount)} points on ${TRANSACTION_LABEL[t.reason]}`,
  }));
  return [...fromPicks, ...fromTransactions].sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()).slice(0, RECENT_ACTIVITY_LIMIT);
}

function computeTier(hasFavorites: boolean, groupCount: number, pickCount: number): PersonalizationTier {
  if (!hasFavorites && groupCount === 0 && pickCount === 0) return "new";
  if (pickCount >= ACTIVE_TIER_MIN_PICKS && groupCount > 0) return "active";
  return "returning";
}

/** One primary, priority-ordered action — never a list. Time-sensitive things (a prediction
 * window that's actually open right now) outrank onboarding, which outranks "come look at what
 * already happened." */
function computeNextAction(
  nextRace: RaceDoc | null,
  myPick: UserPick | null,
  picks: UserPick[],
  races: RaceDoc[],
  hasFavorites: boolean,
  groupCount: number,
): NextAction | null {
  if (nextRace && nextRace.status === "upcoming" && !myPick) {
    return { section: "hero", label: `Make your ${nextRace.name} prediction`, href: raceHref(nextRace.year, nextRace.round, nextRace.name) };
  }
  if (!hasFavorites) {
    return { section: "yourF1", label: "Choose your favorite driver", href: "/profile?section=personalisation" };
  }
  if (groupCount === 0) {
    return { section: "community", label: "Find your F1 community", href: "/groups" };
  }
  if (nextRace && myPick && nextRace.status !== "completed" && !!nextRace.inputs?.length) {
    return { section: "hero", label: "Compare your pick with the model", href: raceHref(nextRace.year, nextRace.round, nextRace.name, "simulation") };
  }
  const lastCompleted = races.filter((r) => r.status === "completed").sort((a, b) => b.round - a.round)[0];
  if (lastCompleted && picks.some((p) => p.raceId === lastCompleted.id)) {
    return { section: "hero", label: "See your prediction vs reality", href: raceHref(lastCompleted.year, lastCompleted.round, lastCompleted.name) };
  }
  return null;
}

export async function getPersonalHomeData(uid: string, year: number, nextRace: RaceDoc | null, races: RaceDoc[]): Promise<PersonalHomeData> {
  const [profile, groups, feed, picks, recentTransactions, predictionPolls] = await Promise.all([
    getUserProfile(uid),
    getUserGroups(uid),
    listFeedPosts(uid, { feedType: "following", limit: FEED_POST_LIMIT }),
    getUserPicksForYear(uid, year),
    listRecentTransactions(uid, RECENT_TRANSACTIONS_LIMIT),
    getRecentPredictionPolls(uid),
  ]);

  const [favoriteDriver, favoriteTeam, discoverGroups, myPick] = await Promise.all([
    profile?.favoriteDrivers?.[0] ? getFavoriteDriverCard(profile.favoriteDrivers[0]) : Promise.resolve(null),
    profile?.favoriteTeams?.[0] ? getFavoriteTeamCard(profile.favoriteTeams[0]) : Promise.resolve(null),
    groups.length === 0 ? listPublicGroups(undefined, uid) : Promise.resolve([]),
    nextRace ? getUserPick(uid, nextRace.id) : Promise.resolve(null),
  ]);

  const hasFavorites = !!favoriteDriver || !!favoriteTeam;
  const predictionPerformance = computePredictionPerformance(picks, races);

  return {
    profile,
    favoriteDriver,
    favoriteTeam,
    groups,
    discoverGroups: discoverGroups.filter((g) => !g.isMember).slice(0, DISCOVER_GROUPS_LIMIT),
    myPick,
    predictionPerformance,
    recentActivity: buildRecentActivity(picks, races, recentTransactions),
    predictionPolls,
    feedPosts: feed.posts.filter((p) => Date.now() - new Date(p.createdAt).getTime() <= COMMUNITY_ACTIVITY_WINDOW_DAYS * 86_400_000),
    tier: computeTier(hasFavorites, groups.length, picks.length),
    nextAction: computeNextAction(nextRace, myPick, picks, races, hasFavorites, groups.length),
  };
}
