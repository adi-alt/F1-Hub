import { SignInGate } from "@/components/auth/SignInGate";
import { GroupsHomeClient } from "./components/GroupsHomeClient";
import { getUserGroups } from "@/lib/supabase/groups";
import { listFeedPosts } from "@/lib/supabase/groupPosts";
import { listMyOpenPredictions } from "@/lib/supabase/groupPredictions";
import { getRacesByYear } from "@/lib/supabase/races";
import { getSession } from "@/lib/session/getSession";

async function getNextRace() {
  const races = await getRacesByYear(new Date().getFullYear());
  const upcoming = races.filter((r) => r.status !== "completed").sort((a, b) => a.round - b.round)[0];
  return upcoming ? { year: upcoming.year, round: upcoming.round, name: upcoming.name, raceDate: upcoming.raceDate ?? null } : null;
}

/** Groups home - feed-first (see GroupsHomeClient's own comment for the full reasoning). Every
 * section fetched in parallel; a failure in any one degrades to that section's own empty state
 * rather than failing this whole page (an empty predictions/next-race list already reads fine as
 * "nothing right now" - Promise.all only needs to not fully reject, and none of these four throws
 * for "no data", only for a real query error, so any real failure still surfaces normally). */
export default async function GroupsPage() {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-[1480px] px-5 py-8 sm:px-8 lg:px-10">
        <SignInGate label="your groups" />
      </div>
    );
  }

  const [groups, feed, predictions, nextRace] = await Promise.all([
    getUserGroups(session.uid),
    listFeedPosts(session.uid),
    listMyOpenPredictions(session.uid),
    getNextRace(),
  ]);

  return (
    <div className="mx-auto sm:max-w-[80vw] px-5 py-8 sm:px-8 lg:px-16">
      <div>
        <h1 className="text-3xl font-bold text-white">Groups</h1>
        <p className="mt-1 text-sm text-neutral-400">What&apos;s happening in the F1 community right now.</p>
      </div>

      <div className="mt-8">
        <GroupsHomeClient groups={groups} initialPosts={feed.posts} initialCursor={feed.nextCursor} predictions={predictions} nextRace={nextRace} />
      </div>
    </div>
  );
}
