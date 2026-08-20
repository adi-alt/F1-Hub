import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { getGroupLeaderboard, getUserGroups } from "@/lib/supabase/groups";
import { groupHref } from "@/lib/routes";

/** Server-rendered, no client state — a link out to /groups is enough interactivity. Capped at 3
 * groups: this is a homepage teaser, not the groups list itself (that's /groups). Rank comes from
 * a real getGroupLeaderboard call per group (no batch/multi-group variant exists — see
 * src/lib/supabase/groups.ts — acceptable N+1 here since a homepage visit is already fetching a
 * handful of things and a user is realistically in a handful of groups, not hundreds). */
export async function GroupsPreview({ uid }: { uid: string }) {
  const groups = await getUserGroups(uid);
  if (groups.length === 0) return null;

  const preview = groups.slice(0, 3);
  const withRank = await Promise.all(
    preview.map(async (g) => {
      const leaderboard = await getGroupLeaderboard(g.id, uid);
      const mine = leaderboard.find((row) => row.userId === uid);
      return { ...g, myRank: mine?.rank ?? null, scoredMemberCount: leaderboard.length };
    }),
  );

  return (
    <section>
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-white">Your groups</h2>
        <Link href="/groups" className="text-sm text-neutral-400 transition hover:text-white">
          View all →
        </Link>
      </div>
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {withRank.map((g) => (
          <Link
            key={g.id}
            href={groupHref(g.id)}
            className="flex items-center gap-3 rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-4 transition hover:border-white/30"
          >
            <EntityAvatar imageUrl={g.avatarUrl} name={g.name} size={40} />
            <div className="min-w-0">
              <p className="truncate font-medium text-white">{g.name}</p>
              <p className="text-xs text-neutral-500">
                {g.myRank
                  ? `You're #${g.myRank} of ${g.scoredMemberCount}`
                  : `${g.memberCount} member${g.memberCount === 1 ? "" : "s"} · no scores yet`}
              </p>
            </div>
          </Link>
        ))}
      </div>
    </section>
  );
}
