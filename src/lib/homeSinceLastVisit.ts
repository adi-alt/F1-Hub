// The home's "Since your last visit" (roadmap R-44): a real diff against the end of the user's
// previous home visit (profiles.last_homepage_visit_at, stamped by HomeVisitBeacon when a visit
// ends), not a list of whatever happened recently. Pure, so it is tested without a database.
import type { SinceLastVisitChange } from "@/lib/ai/sinceLastVisit";

export type ActivityEntry = { key: string; timestamp: string; text: string };

export type HomeSinceLastVisit = {
  /** When the previous visit ended; null on a first visit, when there is nothing to diff against. */
  since: string | null;
  /** Standings changes since then (computeSinceLastVisit), empty on a first visit. */
  changes: SinceLastVisitChange[];
  /** Your picks and points since then; on a first visit, your most recent ones. */
  activity: ActivityEntry[];
  /** Other people's posts in your communities since then (0 on a first visit). */
  newCommunityPosts: number;
};

export function buildHomeSinceLastVisit(params: {
  since: string | null;
  activity: ActivityEntry[];
  changes: SinceLastVisitChange[];
  newCommunityPosts: number;
}): HomeSinceLastVisit {
  const { since } = params;
  if (!since) return { since: null, changes: [], activity: params.activity, newCommunityPosts: 0 };
  const sinceMs = new Date(since).getTime();
  return {
    since,
    changes: params.changes,
    activity: params.activity.filter((a) => new Date(a.timestamp).getTime() > sinceMs),
    newCommunityPosts: params.newCommunityPosts,
  };
}
