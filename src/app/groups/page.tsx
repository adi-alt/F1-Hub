import type { Metadata } from "next";
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
export const metadata: Metadata = {
  title: "Communities",
  description: "Find people and spaces around the things you care about - F1 and everything else.",
};

export default async function GroupsPage() {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="mx-auto max-w-[1480px] px-5 py-8 sm:px-8 lg:px-10">
        <SignInGate label="your communities" />
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
    // Fixed max-width, not sm:max-w-[80vw] - every other top-level F1 HUB page (Season, Circuits,
    // Archive, Users, Models) sizes its content against a fixed pixel cap, never the viewport, so a
    // wide monitor doesn't stretch three columns of feed/rail content arbitrarily wider than the
    // composition below (240/1fr/300, gap-6) is actually designed for.
    <div className="mx-auto max-w-[1320px] px-5 py-6 sm:px-8 lg:px-10">
      {/* One compact line, not a stacked title + subtitle block - the masthead's job is to say
          where you are and what this place is for, then get out of the way of the actual
          workspace beneath it. Real count folded into the same tagline rather than sat beside it
          as a separate metric - "7 communities" as bare metadata read as generic dashboard
          chrome; said in a sentence, it's just a true fact about your own account. */}
      <div className="flex flex-wrap items-baseline gap-x-2.5 gap-y-0.5">
        <h1 className="text-2xl font-bold text-white">Communities</h1>
        <p className="text-sm text-neutral-500">
          {groups.length > 0 ? (
            <>
              Race-weekend discussion and predictions across your {groups.length} {groups.length === 1 ? "community" : "communities"}.
            </>
          ) : (
            "Your F1 conversation, predictions and race-weekend discussion."
          )}
        </p>
      </div>

      <div className="mt-5">
        <GroupsHomeClient groups={groups} initialPosts={feed.posts} initialCursor={feed.nextCursor} predictions={predictions} nextRace={nextRace} />
      </div>
    </div>
  );
}
