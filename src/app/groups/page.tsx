import type { Metadata } from "next";
import { SignInGate } from "@/components/auth/SignInGate";
import { GroupsHomeClient } from "./components/GroupsHomeClient";
import { getUserGroups } from "@/lib/supabase/groups";
import { listFeedPosts } from "@/lib/supabase/groupPosts";
import { listMyPredictions } from "@/lib/supabase/groupPredictions";
import { getDriverHeadshotsByCode, getRaceById, getRaceRoster, getRacesByYear } from "@/lib/supabase/races";
import { getNextRace } from "@/lib/supabase/nextRace";
import { getCommunityPulse } from "@/lib/supabase/communityPulse";
import { getSession } from "@/lib/session/getSession";
import { getCurrentSeason } from "@/lib/currentSeason";

/** The rounds a prediction can still be opened on: this season's own races that haven't finished,
 * in calendar order. Exactly what createPrediction will accept (it rejects a completed race
 * server-side), so the composer's picker can't offer something the server will refuse.
 *
 * getNextRace itself now lives in lib/supabase/nextRace.ts - a single community's own context rail
 * renders the same widget, and a copied photo-fallback chain is how two callers drift apart. */
async function getRaceContext() {
  const races = await getRacesByYear(await getCurrentSeason());
  const upcomingRaces = races
    .filter((r) => r.status !== "completed")
    .sort((a, b) => a.round - b.round)
    .map((r) => ({ id: r.id, name: r.name, round: r.round, status: r.status }));
  return { nextRace: await getNextRace(races), upcomingRaces };
}

/**
 * Driver rosters for exactly the races the viewer's own open rounds reference - the same handful of
 * small fetches a community's own page already does (see groups/[id]/page.tsx), not the whole
 * season.
 *
 * This is what lets a prediction be entered from the feed itself. Without a real roster the card
 * could only ever link away to the community page, which is what "Enter prediction" used to do -
 * a navigation dressed up as an action. getRaceRoster is what keeps that roster real even for a
 * race the pipeline hasn't reached yet - see its own comment.
 */
async function getDriversByRace(raceIds: string[]): Promise<Record<string, { code: string; name: string; headshotUrl: string | null }[]>> {
  const unique = [...new Set(raceIds)];
  const races = await Promise.all(unique.map((raceId) => getRaceById(raceId)));
  const rosters = await Promise.all(races.map((race) => (race ? getRaceRoster(race) : [])));
  // Current roster first, the archive for anyone that misses (a departed driver a season-opener's
  // previous-year fallback roster pulled in) - see getDriverHeadshotsByCode's own comment.
  const headshotByCode = await getDriverHeadshotsByCode(rosters.flat().map((r) => r.driver));
  const byRace: Record<string, { code: string; name: string; headshotUrl: string | null }[]> = {};
  unique.forEach((raceId, i) => {
    byRace[raceId] = rosters[i].map((r) => ({ code: r.driver, name: r.driverName, headshotUrl: headshotByCode.get(r.driver) ?? null }));
  });
  return byRace;
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
      <div className="page-wide py-8">
        <SignInGate label="your communities" />
      </div>
    );
  }

  const [groups, feed, predictions, raceContext, pulse] = await Promise.all([
    getUserGroups(session.uid),
    listFeedPosts(session.uid),
    listMyPredictions(session.uid),
    getRaceContext(),
    // Reads the previous visit timestamp and stamps a new one - so it must run exactly once per
    // page load, here, not inside a client component that could re-run and collapse the window.
    getCommunityPulse(session.uid),
  ]);

  // Sequential on purpose: it depends on which rounds came back above.
  const driversByRace = await getDriversByRace(predictions.map((p) => p.raceId));

  return (
    // The same frame as every page. The document scrolls, the feed with it (audit R-31); at lg+ the
    // two rails stay in view beside it (sticky, GroupsHomeClient), and only the community list inside
    // the left rail scrolls on its own.
    <div className="page-wide py-6">
      {/* No separate page header above the workspace anymore - the page title and its one-line
          description live at the top of the navigation rail itself (GroupsLeftSidebar), so the
          three columns start at the same baseline and the feed is the first thing at eye level
          rather than sitting a header's height below it. */}
      <div>
        <GroupsHomeClient
          groups={groups}
          initialPosts={feed.posts}
          initialCursor={feed.nextCursor}
          predictions={predictions}
          nextRace={raceContext.nextRace}
          upcomingRaces={raceContext.upcomingRaces}
          pulse={pulse}
          driversByRace={driversByRace}
        />
      </div>
    </div>
  );
}
