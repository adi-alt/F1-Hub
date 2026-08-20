import Link from "next/link";
import { notFound } from "next/navigation";
import { GroupRealtimeWatcher } from "@/components/GroupRealtimeWatcher";
import { SignInGate } from "@/components/auth/SignInGate";
import { AvatarUpload } from "../components/AvatarUpload";
import { GroupAvatar } from "../components/GroupAvatar";
import { InviteLink } from "../components/InviteLink";
import { JoinPrompt } from "../components/JoinPrompt";
import { getGroupDetail, getGroupLeaderboard, getGroupPreview, getMemberRole } from "@/lib/supabase/groups";
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

  const [group, leaderboard] = await Promise.all([getGroupDetail(id, session.uid), getGroupLeaderboard(id, session.uid)]);

  return (
    <div className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
      <GroupRealtimeWatcher groupId={id} />
      <Link href="/groups" className="text-sm text-neutral-500 hover:text-neutral-300">
        ← Groups
      </Link>

      <div className="mt-2 flex items-center gap-4">
        <GroupAvatar avatarUrl={group.avatarUrl} name={group.name} size={56} />
        <div>
          <h1 className="text-2xl font-bold text-white">{group.name}</h1>
          <p className="text-xs text-neutral-500">
            {group.members.length} member{group.members.length === 1 ? "" : "s"}
          </p>
        </div>
      </div>

      <div className="mt-6 space-y-3">
        <InviteLink groupId={id} />
        {group.myRole === "admin" && <AvatarUpload groupId={id} />}
      </div>

      <div className="mt-10">
        <h2 className="mb-3 text-lg font-semibold text-white">Leaderboard</h2>
        {leaderboard.length === 0 ? (
          <p className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-6 text-center text-neutral-400">
            No scored races yet — scores land here once a race a member picked finishes.
          </p>
        ) : (
          <ol className="space-y-2">
            {leaderboard.map((row) => (
              <li
                key={row.userId}
                className="flex items-center justify-between rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-4 py-3"
              >
                <div className="flex items-center gap-3">
                  <span className="w-6 text-sm font-semibold text-neutral-500">{row.rank}</span>
                  <span className="font-medium text-white">{row.displayName ?? row.username ?? "Member"}</span>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-white">{row.totalScore} pts</p>
                  <p className="text-xs text-neutral-500">
                    {row.racesScored} race{row.racesScored === 1 ? "" : "s"}
                  </p>
                </div>
              </li>
            ))}
          </ol>
        )}
      </div>

      <div className="mt-10">
        <h2 className="mb-3 text-lg font-semibold text-white">Members</h2>
        <ul className="grid gap-2 sm:grid-cols-2">
          {group.members.map((m) => (
            <li
              key={m.userId}
              className="flex items-center justify-between rounded-lg border border-[var(--f1-line)] bg-black/20 px-3 py-2 text-sm"
            >
              <span className="text-neutral-200">{m.displayName ?? m.username ?? "Member"}</span>
              {m.role === "admin" && <span className="text-xs text-neutral-500">admin</span>}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}
