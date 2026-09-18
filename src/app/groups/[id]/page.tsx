import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GroupRealtimeWatcher } from "@/components/GroupRealtimeWatcher";
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
} from "@/lib/supabase/groups";
import { getGroupPulse, getGroupStats, type GroupStats } from "@/lib/supabase/groupStats";
import { getPredictionTrend, listPredictions } from "@/lib/supabase/groupPredictions";
import { listPosts } from "@/lib/supabase/groupPosts";
import { getPointsBalance } from "@/lib/supabase/points";
import { getRaceById, getRacesByYear } from "@/lib/supabase/races";
import { getNextRace } from "@/lib/supabase/nextRace";
import { getSession } from "@/lib/session/getSession";
import { isF1Type, resolveModules } from "@/lib/communities";

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
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const preview = await getGroupPreview(id).catch(() => null);
  return { title: preview ? preview.name : "Community" };
}

export default async function CommunityPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string; post?: string }>;
}) {
  const { id } = await params;
  const { tab: requestedTab, post: requestedPost } = await searchParams;
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <SignInGate label="this community" />
      </div>
    );
  }

  // Captured after the sign-in check so it stays a plain string inside the closures below, where
  // TypeScript's narrowing of `session.uid` wouldn't survive.
  const uid = session.uid;

  const role = await getMemberRole(id, uid);
  if (!role) {
    const [preview, joinRequest] = await Promise.all([getGroupPreview(id), getMyJoinRequest(id, uid).catch(() => null)]);
    if (!preview) notFound();
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <JoinPrompt group={preview} joinRequestStatus={joinRequest?.status ?? null} />
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
  const wantsRace = isF1Type(group.communityType);

  const [feed, leaderboard, predictions, pointsBalance, seasonRaces, pendingRequests, stats, pulse, nextRace] = await Promise.all([
    listPosts(id, uid),
    wantsLeaderboard ? getGroupLeaderboard(id, uid) : Promise.resolve([]),
    wantsPredictions ? listPredictions(id, uid) : Promise.resolve([]),
    getPointsBalance(uid),
    wantsPredictions && wantsRace ? getRacesByYear(new Date().getFullYear()) : Promise.resolve([]),
    canModerate ? countPendingJoinRequests(id).catch(() => 0) : Promise.resolve(0),
    getGroupStats(id, uid).catch(() => statsFallback(group.members.length)),
    // Reads this member's previous visit to THIS community and stamps a new one - so it must run
    // exactly once per page load, here, not inside a client component that could re-run and
    // collapse the window.
    getGroupPulse(id, uid),
    wantsRace ? getNextRace().catch(() => null) : Promise.resolve(null),
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
  const predictionRaceIds = [...new Set(predictions.map((p) => p.raceId))];
  const predictionRaces = await Promise.all(predictionRaceIds.map((raceId) => getRaceById(raceId)));
  const driversByRace: Record<string, { code: string; name: string }[]> = {};
  predictionRaceIds.forEach((raceId, i) => {
    const race = predictionRaces[i];
    const roster = race?.inputs?.length ? race.inputs : (race?.results ?? []);
    driversByRace[raceId] = roster.map((r) => ({ code: r.driver, name: r.driverName }));
  });

  // The rail's own rounds: the open ones, soonest first, with their community trend fetched here
  // rather than by the card after it mounts - the rail is above the fold and a request-per-card
  // waterfall is visible as bars that appear a beat late. A trend that fails resolves to null and
  // that card simply renders without bars.
  const openPredictions = predictions
    .filter((p) => p.status === "open")
    .sort((a, b) => {
      // A round with no date yet sorts last: there's nothing to be soonest about.
      if (!a.raceDate) return 1;
      if (!b.raceDate) return -1;
      return new Date(a.raceDate).getTime() - new Date(b.raceDate).getTime();
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
    <div className="mx-auto max-w-[1280px] px-4 py-6 sm:px-6 lg:px-8">
      <GroupRealtimeWatcher groupId={id} />

      <Link href="/groups" className="inline-flex items-center gap-1.5 text-sm text-neutral-500 transition hover:text-neutral-300">
        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden>
          <path d="M9.5 3.5 5 8l4.5 4.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
        Back to communities
      </Link>

      <div className="mt-3">
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
        />
      </div>
    </div>
  );
}
