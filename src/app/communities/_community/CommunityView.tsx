import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { GroupRealtimeWatcher } from "@/components/GroupRealtimeWatcher";
import { GroupVisitBeacon } from "./components/GroupVisitBeacon";
import { SignInGate } from "@/components/auth/SignInGate";
import { JoinPrompt } from "../components/JoinPrompt";
import { CommunityWorkspace } from "./components/CommunityWorkspace";
import type { RailPrediction } from "./components/CommunityRightRail";
import {
  countPendingJoinRequests,
  getGroupDetail,
  getGroupLeaderboard,
  getGroupPreview,
  getMemberRole,
  getMyJoinRequest,
  inspectInvite,
  isBanned,
} from "@/lib/supabase/groups";
import { isUuid } from "@/lib/ids";
import { getGroupPulse, getGroupStats, type GroupStats } from "@/lib/supabase/groupStats";
import { getPredictionTrend, listPredictions } from "@/lib/supabase/groupPredictions";
import { listPosts } from "@/lib/supabase/groupPosts";
import { getPointsBalance } from "@/lib/supabase/points";
import { getDriverHeadshotsByCode, getRaceById, getRaceRoster, getRacesByYear } from "@/lib/supabase/races";
import { getNextRace } from "@/lib/supabase/nextRace";
import { getSession } from "@/lib/session/getSession";
import { isF1Type, resolveModules } from "@/lib/communities";
import { getCurrentSeason } from "@/lib/currentSeason";
import { getCallableRace } from "@/lib/supabase/postCalls";
import { getCommunityWeekend, getCrowdVsModel } from "@/lib/supabase/communityWeekend";
import { pageMetadata } from "@/lib/seo";
import { groupHref } from "@/lib/routes";

/** How many open rounds the context rail shows before it stops being a rail. The rest are one
 * click away in the Predictions tab it links to. */
const RAIL_PREDICTION_LIMIT = 2;

/** A stats failure must not take the page down - the feed beside it is the actual content. The
 * member count still comes from the membership rows this page has already loaded, so the rail and
 * the header can't disagree about how many people are here; the counts this page has no other
 * source for degrade to zero, and the widget reads as a quiet community rather than a broken one. */
function statsFallback(memberCount: number): GroupStats {
  return { members: memberCount, posts: 0, weeklyPosts: 0, previousWeeklyPosts: 0, activeMembers: 0 };
}

// getGroupPreview works regardless of membership (it's also what the not-a-member JoinPrompt
// branch below uses) and is cached, so this costs a cache hit, not a second real fetch.
export async function communityMetadata(id: string): Promise<Metadata> {
  const preview = isUuid(id) ? await getGroupPreview(id).catch(() => null) : null;
  if (!preview) return pageMetadata({ title: "Community", description: "A prediction league and F1 community on Apex F1 Hub.", path: groupHref(id) });
  // A private community's own description stays private: only its name goes on the card (an invite link needs it).
  const about = preview.visibility === "public" && preview.description ? preview.description : "A prediction league and F1 community on Apex F1 Hub.";
  const members = `${preview.memberCount} member${preview.memberCount === 1 ? "" : "s"}`;
  // Only a public community belongs in search results; the others are reached by link or invitation.
  return pageMetadata({ title: preview.name, description: `${about} ${members}.`, path: groupHref(id), index: preview.visibility === "public" });
}

/** One community, at `/groups?id=` (the Communities page renders this when the URL names a community). */
export async function CommunityView({
  id,
  tab: requestedTab,
  post: requestedPost,
  invite: inviteToken,
}: {
  id: string;
  tab?: string;
  post?: string;
  invite?: string;
}) {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="page-narrow py-10">
        <SignInGate label="this community" />
      </div>
    );
  }

  // Captured after the sign-in check so it stays a plain string inside the closures below, where
  // TypeScript's narrowing of `session.uid` wouldn't survive.
  const uid = session.uid;
  if (!isUuid(id)) notFound();

  const role = await getMemberRole(id, uid);
  if (!role) {
    const [preview, joinRequest, inviteState, banned] = await Promise.all([
      getGroupPreview(id),
      getMyJoinRequest(id, uid).catch(() => null),
      // What the invitation in the URL would do right now (valid / expired / cancelled / used up),
      // checked without consuming it. Joining re-checks everything atomically on the server.
      inspectInvite(id, typeof inviteToken === "string" ? inviteToken : null).catch(() => null),
      isBanned(id, uid).catch(() => false),
    ]);
    if (!preview) notFound();
    return (
      <div className="page-narrow py-10">
        <JoinPrompt
          group={preview}
          joinRequestStatus={joinRequest?.status ?? null}
          inviteToken={inviteState === "valid" && typeof inviteToken === "string" ? inviteToken : null}
          inviteState={inviteState}
          banned={banned}
        />
      </div>
    );
  }

  const group = await getGroupDetail(id, uid);
  const modules = resolveModules(group.communityType, group.features);
  const canModerate = group.myRole === "admin" || group.myRole === "moderator";

  // Only fetch what this community's own modules actually render. A Photography community never
  // touches group_predictions or the race tables at all - that's the point of feature-driven
  // navigation being real rather than just hiding tabs. The same rule now covers the context rail:
  // a non-F1 community fetches no race at all, so it can't be shown one.
  const wantsPredictions = modules.includes("predictions");
  const wantsLeaderboard = modules.includes("leaderboard");
  // An F1 type, or any community about Formula 1 (a private circle of friends who follow it): the race weekend, the
  // race card and Apex belong on its page too.
  const wantsRace = isF1Type(group.communityType) || group.topic === "Formula 1";

  const season = await getCurrentSeason();
  const [feed, leaderboard, predictions, pointsBalance, seasonRaces, pendingRequests, stats, pulse, nextRace, callableRace, weekend, crowdVsModel] = await Promise.all([
    listPosts(id, uid),
    wantsLeaderboard ? getGroupLeaderboard(id, uid) : Promise.resolve([]),
    wantsPredictions ? listPredictions(id, uid) : Promise.resolve([]),
    getPointsBalance(uid),
    wantsPredictions && wantsRace ? getRacesByYear(season) : Promise.resolve([]),
    canModerate ? countPendingJoinRequests(id).catch(() => 0) : Promise.resolve(0),
    getGroupStats(id, uid).catch(() => statsFallback(group.members.length)),
    // Reads this member's previous visit to THIS community. Read-only: the visit is stamped when
    // the page is left (GroupVisitBeacon), so a refresh during the visit doesn't reset the window.
    getGroupPulse(id, uid),
    wantsRace ? getNextRace().catch(() => null) : Promise.resolve(null),
    // Takes with receipts: this weekend's race while calls are open, for an F1 community's composer.
    wantsRace ? getCallableRace(season).catch(() => null) : Promise.resolve(null),
    // The race weekend this community is living in, as on the Communities home, with "called it" counted from this
    // community's own rounds. Decoration around the feed: a failure leaves the bar out, never the page.
    wantsRace ? getCommunityWeekend(uid, season, undefined, { groupIds: [id] }).catch(() => null) : Promise.resolve(null),
    // This community against the Apex model this season, for the rail's league widget.
    wantsRace && wantsPredictions ? getCrowdVsModel([{ id, name: group.name, avatarUrl: group.avatarUrl }], season).catch(() => null) : Promise.resolve(null),
  ]);

  // Races for the prediction race picker - current season, most recent first, so the realistic
  // choice (this weekend, or one that just finished and needs resolving) is near the top. Includes
  // calendar-only placeholder rounds: createPrediction promotes one into a real `races` row the
  // first time it's picked, so a round can be set up before the pipeline has session data.
  const races = [...seasonRaces].reverse().map((r) => ({ id: r.id, name: r.name, round: r.round, status: r.status }));
  // What createPrediction will actually accept. The composer offers only these, so it can never
  // present a round the server is going to refuse.
  const upcomingRaces = [...seasonRaces]
    .filter((r) => r.status !== "completed")
    .sort((a, b) => a.round - b.round)
    .map((r) => ({ id: r.id, name: r.name, round: r.round, status: r.status }));

  // Driver rosters only for races an existing prediction already references - a handful of small
  // fetches, not the whole season, so a guess picker has real names to offer instead of free text.
  // getRaceRoster falls back to the most recently known line-up when this specific race's own
  // entry list or grid hasn't landed yet - see its own comment for why an empty picker here was
  // blocking every prediction on a freshly-opened round, not just an occasional one.
  const predictionRaceIds = [...new Set(predictions.map((p) => p.raceId))];
  const predictionRaces = await Promise.all(predictionRaceIds.map((raceId) => getRaceById(raceId)));
  const predictionRosters = await Promise.all(predictionRaces.map((race) => (race ? getRaceRoster(race) : [])));
  // Current roster first, the archive for anyone that misses - the same lookup the feed's own
  // getDriversByRace uses (see groups/page.tsx and getDriverHeadshotsByCode's own comment).
  const headshotByCode = await getDriverHeadshotsByCode(predictionRosters.flat().map((r) => r.driver));
  const driversByRace: Record<string, { code: string; name: string; headshotUrl: string | null }[]> = {};
  predictionRaceIds.forEach((raceId, i) => {
    driversByRace[raceId] = predictionRosters[i].map((r) => ({ code: r.driver, name: r.driverName, headshotUrl: headshotByCode.get(r.driver) ?? null }));
  });

  // The rail's own rounds: the open ones, soonest first, with their community trend fetched here
  // rather than by the card after it mounts - the rail is above the fold and a request-per-card
  // waterfall is visible as bars that appear a beat late. A trend that fails resolves to null and
  // that card simply renders without bars.
  const openPredictions = predictions
    .filter((p) => p.state === "open")
    .sort((a, b) => {
      // Soonest deadline first. An open round always has one (an unknown deadline is closed), but
      // sort defensively rather than assume it.
      if (!a.lockAt) return 1;
      if (!b.lockAt) return -1;
      return Date.parse(a.lockAt) - Date.parse(b.lockAt);
    })
    .slice(0, RAIL_PREDICTION_LIMIT);
  const railPredictions: RailPrediction[] = await Promise.all(
    openPredictions.map(async (prediction) => ({ prediction, trend: await getPredictionTrend(prediction.id, uid).catch(() => null) })),
  );

  // Posts sitting in the approval queue, for the feed's moderator-only filter. Derived from the
  // page the feed already has rather than a second query: `listPosts` returns pending rows to a
  // moderator, so this is a count of what's genuinely visible to them on this page. It's a
  // first-page figure and the filter itself queries the real thing.
  const pendingPosts = canModerate ? feed.posts.filter((p) => p.status === "pending").length : undefined;

  return (
    // Wide enough for a real two-column workspace (content + context rail) at desktop widths, while
    // the content column itself stays a comfortable reading measure. Matches the Communities index's
    // own max width rather than inventing a third one for this page.
    // No top padding: the head brings its own, so its full-bleed cover meets the site header as the circuit page's does.
    <div className="page-wide pb-10">
      <GroupRealtimeWatcher groupId={id} />
      <GroupVisitBeacon groupId={id} />

      <div>
        <CommunityWorkspace
          group={group}
          myUserId={uid}
          leaderboard={leaderboard}
          posts={feed.posts}
          postsCursor={feed.nextCursor}
          predictions={predictions}
          railPredictions={railPredictions}
          races={races}
          upcomingRaces={upcomingRaces}
          callableRace={callableRace}
          driversByRace={driversByRace}
          pointsBalance={pointsBalance}
          memberCount={group.members.length}
          stats={stats}
          pulse={pulse}
          nextRace={nextRace}
          pendingRequests={canModerate ? pendingRequests : undefined}
          pendingPosts={pendingPosts}
          // A post permalink is a link to a conversation in the feed, so it lands on the feed
          // regardless of which tab the URL otherwise asks for - opening `?post=` on the
          // Leaderboard would show the discussion window over a panel it has nothing to do with.
          initialTab={requestedPost ? "feed" : (requestedTab ?? null)}
          focusPostId={requestedPost ?? null}
          isF1={wantsRace}
          weekend={weekend}
          crowdVsModel={crowdVsModel}
        />
      </div>
    </div>
  );
}
