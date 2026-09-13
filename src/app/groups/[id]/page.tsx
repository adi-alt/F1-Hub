import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { GroupRealtimeWatcher } from "@/components/GroupRealtimeWatcher";
import { SignInGate } from "@/components/auth/SignInGate";
import { JoinPrompt } from "../components/JoinPrompt";
import { CommunityHeader } from "./components/CommunityHeader";
import { CommunityTabs } from "./components/CommunityTabs";
import {
  countPendingJoinRequests,
  getGroupDetail,
  getGroupLeaderboard,
  getGroupPreview,
  getMemberRole,
  getMyJoinRequest,
} from "@/lib/supabase/groups";
import { listPredictions } from "@/lib/supabase/groupPredictions";
import { listPosts } from "@/lib/supabase/groupPosts";
import { getPointsBalance } from "@/lib/supabase/points";
import { getRaceById, getRacesByYear } from "@/lib/supabase/races";
import { getSession } from "@/lib/session/getSession";
import { isF1Type, resolveModules } from "@/lib/communities";

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
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: requestedTab } = await searchParams;
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <SignInGate label="this community" />
      </div>
    );
  }

  const role = await getMemberRole(id, session.uid);
  if (!role) {
    const [preview, joinRequest] = await Promise.all([getGroupPreview(id), getMyJoinRequest(id, session.uid).catch(() => null)]);
    if (!preview) notFound();
    return (
      <div className="mx-auto max-w-2xl px-4 py-10 sm:px-6">
        <JoinPrompt group={preview} joinRequestStatus={joinRequest?.status ?? null} />
      </div>
    );
  }

  const group = await getGroupDetail(id, session.uid);
  const modules = resolveModules(group.communityType, group.features);
  const canModerate = group.myRole === "admin" || group.myRole === "moderator";

  // Only fetch what this community's own modules actually render. A Photography community never
  // touches group_predictions or the race tables at all - that's the point of feature-driven
  // navigation being real rather than just hiding tabs.
  const wantsPredictions = modules.includes("predictions");
  const wantsLeaderboard = modules.includes("leaderboard");

  const [feed, leaderboard, predictions, pointsBalance, seasonRaces, pendingRequests] = await Promise.all([
    listPosts(id, session.uid),
    wantsLeaderboard ? getGroupLeaderboard(id, session.uid) : Promise.resolve([]),
    wantsPredictions ? listPredictions(id, session.uid) : Promise.resolve([]),
    getPointsBalance(session.uid),
    wantsPredictions && isF1Type(group.communityType) ? getRacesByYear(new Date().getFullYear()) : Promise.resolve([]),
    canModerate ? countPendingJoinRequests(id).catch(() => 0) : Promise.resolve(0),
  ]);

  // Races for the prediction race picker - current season, most recent first, so the realistic
  // choice (this weekend, or one that just finished and needs resolving) is near the top. Includes
  // calendar-only placeholder rounds: createPrediction promotes one into a real `races` row the
  // first time it's picked, so a round can be set up before the pipeline has session data.
  const races = [...seasonRaces].reverse().map((r) => ({ id: r.id, name: r.name, round: r.round, status: r.status }));

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

  return (
    // Wider than the old max-w-3xl, which left most of a desktop screen empty, but still a
    // comfortable reading measure rather than full-bleed.
    <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6">
      <GroupRealtimeWatcher groupId={id} />

      <Link href="/groups" className="text-sm text-neutral-500 transition hover:text-neutral-300">
        ← Communities
      </Link>

      <div className="mt-3">
        <CommunityHeader group={group} memberCount={group.members.length} pendingRequests={canModerate ? pendingRequests : undefined} />
      </div>

      <div className="mt-7">
        <CommunityTabs
          group={group}
          myUserId={session.uid}
          leaderboard={leaderboard}
          posts={feed.posts}
          postsCursor={feed.nextCursor}
          predictions={predictions}
          races={races}
          driversByRace={driversByRace}
          pointsBalance={pointsBalance}
          memberCount={group.members.length}
          initialTab={requestedTab ?? null}
        />
      </div>
    </div>
  );
}
