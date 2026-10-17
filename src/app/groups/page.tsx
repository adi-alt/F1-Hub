import type { Metadata } from "next";
import { SignInGate } from "@/components/auth/SignInGate";
import { GroupsHomeClient } from "./components/GroupsHomeClient";
import { getUserGroups, discoverCommunities } from "@/lib/supabase/groups";
import { listFeedPosts } from "@/lib/supabase/groupPosts";
import { listMyPredictions } from "@/lib/supabase/groupPredictions";
import { getDriverHeadshotsByCode, getRaceById, getRaceRoster, getRacesByYear } from "@/lib/supabase/races";
import { getNextRace } from "@/lib/supabase/nextRace";
import { getCommunityPulse } from "@/lib/supabase/communityPulse";
import { getSession } from "@/lib/session/getSession";
import { getCurrentSeason } from "@/lib/currentSeason";
import { pageMetadata } from "@/lib/seo";
import { getCommunityWeekend, getCrowdVsModel, getModelPicks } from "@/lib/supabase/communityWeekend";
import { getCallableRace } from "@/lib/supabase/postCalls";

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
async function getDriversByRace(raceIds: string[]): Promise<Record<string, { code: string; name: string; headshotUrl: string | null; team: string }[]>> {
  const unique = [...new Set(raceIds)];
  const races = await Promise.all(unique.map((raceId) => getRaceById(raceId)));
  const rosters = await Promise.all(races.map((race) => (race ? getRaceRoster(race) : [])));
  // Current roster first, the archive for anyone that misses (a departed driver a season-opener's
  // previous-year fallback roster pulled in) - see getDriverHeadshotsByCode's own comment.
  const headshotByCode = await getDriverHeadshotsByCode(rosters.flat().map((r) => r.driver));
  const byRace: Record<string, { code: string; name: string; headshotUrl: string | null; team: string }[]> = {};
  unique.forEach((raceId, i) => {
    byRace[raceId] = rosters[i].map((r) => ({ code: r.driver, name: r.driverName, headshotUrl: headshotByCode.get(r.driver) ?? null, team: r.team }));
  });
  return byRace;
}

/** Groups home - feed-first (see GroupsHomeClient's own comment for the full reasoning). Every
 * section fetched in parallel; a failure in any one degrades to that section's own empty state
 * rather than failing this whole page (an empty predictions/next-race list already reads fine as
 * "nothing right now" - Promise.all only needs to not fully reject, and none of these four throws
 * for "no data", only for a real query error, so any real failure still surfaces normally). */
export const metadata: Metadata = pageMetadata({
  title: "Communities",
  description: "Prediction leagues and F1 communities: pick the podium every Grand Prix with friends and see who reads the sport best.",
  path: "/groups",
});

export default async function GroupsPage() {
  const session = await getSession();
  if (!session.uid) {
    return (
      <div className="page-wide py-8">
        <SignInGate label="your communities" />
      </div>
    );
  }

  const season = await getCurrentSeason();
  const [groups, feed, predictions, raceContext, pulse, discover, weekend, callableRace] = await Promise.all([
    getUserGroups(session.uid),
    listFeedPosts(session.uid),
    listMyPredictions(session.uid),
    getRaceContext(),
    // Reads the previous visit timestamp and stamps a new one - so it must run exactly once per
    // page load, here, not inside a client component that could re-run and collapse the window.
    getCommunityPulse(session.uid),
    // A few public communities to suggest (the same cached query the Discover sheet uses).
    discoverCommunities({ uid: session.uid, limit: 12 }).catch(() => ({ communities: [] })),
    // Race-weekend mode: the weekend the section lives in, its sessions and results. Read-only; on a failure the page
    // falls back to the plain race strip rather than failing.
    getCommunityWeekend(session.uid, season).catch((err) => {
      console.error("getCommunityWeekend:", err);
      return null;
    }),
    // Takes with receipts: the race calls can be made on now, if any. A failure just hides "Make a call".
    getCallableRace(season).catch(() => null),
  ]);
  const suggestions = discover.communities.filter((c) => !c.isMember).slice(0, 3);

  // Sequential on purpose: these depend on which rounds and communities came back above. Each degrades on its own.
  const raceIds = predictions.map((p) => p.raceId);
  const [driversByRace, modelByRace, crowdVsModel] = await Promise.all([
    getDriversByRace(raceIds),
    getModelPicks(raceIds).catch(() => ({})),
    getCrowdVsModel(groups.map((g) => ({ id: g.id, name: g.name, avatarUrl: g.avatarUrl })), season).catch((err) => {
      console.error("getCrowdVsModel:", err);
      return null;
    }),
  ]);

  return (
    // The same frame as every page, without its vertical padding: GroupsHomeClient is an app shell that fills the
    // window under the header from lg, with only the feed scrolling.
    <div className="page-wide">
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
          modelByRace={modelByRace}
          weekend={weekend}
          crowdVsModel={crowdVsModel}
          callableRace={callableRace}
          suggestions={suggestions}
        />
      </div>
    </div>
  );
}
