import Link from "next/link";
import { notFound } from "next/navigation";
import { GroupRealtimeWatcher } from "@/components/GroupRealtimeWatcher";
import { SignInGate } from "@/components/auth/SignInGate";
import { EntityAvatar } from "@/components/EntityAvatar";
import { InviteLink } from "../components/InviteLink";
import { JoinPrompt } from "../components/JoinPrompt";
import { GroupDetailTabs } from "./components/GroupDetailTabs";
import { getGroupDetail, getGroupLeaderboard, getGroupPreview, getMemberRole } from "@/lib/supabase/groups";
import { listPredictions } from "@/lib/supabase/groupPredictions";
import { listPosts } from "@/lib/supabase/groupPosts";
import { getPointsBalance } from "@/lib/supabase/points";
import { getRaceById, getRacesByYear } from "@/lib/supabase/races";
import { getSession } from "@/lib/session/getSession";

export default async function GroupPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <SignInGate label="this group" />
      </div>
    );
  }

  const role = await getMemberRole(id, session.uid);
  if (!role) {
    const preview = await getGroupPreview(id);
    if (!preview) notFound();
    return (
      <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <JoinPrompt group={preview} />
      </div>
    );
  }

  const [group, leaderboard, posts, predictions, pointsBalance] = await Promise.all([
    getGroupDetail(id, session.uid),
    getGroupLeaderboard(id, session.uid),
    listPosts(id, session.uid),
    listPredictions(id, session.uid),
    getPointsBalance(session.uid),
  ]);

  // Races for the admin's own "new prediction" race picker - current season, most recent first, so
  // the realistic choice (this weekend, or one that just finished and needs resolving) is on top.
  const seasonRaces = await getRacesByYear(new Date().getFullYear());
  const races = [...seasonRaces].reverse().map((r) => ({ id: r.id, name: r.name, round: r.round, status: r.status }));

  // Driver rosters for every race any prediction in this group already references - one small
  // fetch per unique race (typically a handful), not the whole season, so a guess dropdown has
  // real names/codes to pick from instead of free-text.
  const predictionRaceIds = [...new Set(predictions.map((p) => p.raceId))];
  const predictionRaces = await Promise.all(predictionRaceIds.map((raceId) => getRaceById(raceId)));
  const driversByRace: Record<string, { code: string; name: string }[]> = {};
  predictionRaceIds.forEach((raceId, i) => {
    const race = predictionRaces[i];
    const roster = race?.inputs?.length ? race.inputs : (race?.results ?? []);
    driversByRace[raceId] = roster.map((r) => ({ code: r.driver, name: r.driverName }));
  });

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <GroupRealtimeWatcher groupId={id} />
      <Link href="/groups" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Groups
      </Link>

      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-4">
          <EntityAvatar imageUrl={group.avatarUrl} name={group.name} size={56} />
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold text-white">{group.name}</h1>
              <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{group.visibility === "public" ? "Public" : "Private"}</span>
            </div>
            {group.description && <p className="mt-0.5 text-sm text-neutral-400">{group.description}</p>}
            <p className="mt-1 text-xs text-neutral-500">
              {group.members.length} member{group.members.length === 1 ? "" : "s"} · {predictions.filter((p) => p.status === "open").length} active predictions · Created{" "}
              {new Date(group.createdAt).toLocaleDateString(undefined, { month: "short", year: "numeric" })}
            </p>
          </div>
        </div>
        <InviteLink groupId={id} />
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-neutral-500">
        <span>
          Your role <span className="font-semibold text-neutral-300">{group.myRole}</span>
        </span>
        <span>
          Your points <span className="font-mono font-semibold text-neutral-300">{pointsBalance}</span>
        </span>
      </div>

      <div className="mt-8">
        <GroupDetailTabs
          group={group}
          myUserId={session.uid}
          leaderboard={leaderboard}
          posts={posts}
          predictions={predictions}
          races={races}
          driversByRace={driversByRace}
          pointsBalance={pointsBalance}
        />
      </div>
    </div>
  );
}
