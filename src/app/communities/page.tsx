import type { Metadata } from "next";
import { Suspense } from "react";
import { SignInGate } from "@/components/auth/SignInGate";
import { CommunityView, communityMetadata } from "./_community/CommunityView";
import { CommunityDetailSkeleton } from "./_community/components/CommunityDetailSkeleton";
import { GroupsHomeClient } from "./components/GroupsHomeClient";
import { GroupsHomeSkeleton } from "./components/GroupsHomeSkeleton";
import { getUserGroups, getUserMemberships, discoverCommunities, getGroupPreview } from "@/lib/supabase/groups";
import { isUuid } from "@/lib/ids";
import { listFeedPosts } from "@/lib/supabase/groupPosts";
import { getPredictionTrends, listMyPredictions, type PredictionTrend } from "@/lib/supabase/groupPredictions";
import { getDriverHeadshotsByCode, getRaceById, getRaceRoster, getRaceScheduleByYear } from "@/lib/supabase/races";
import { getNextRace } from "@/lib/supabase/nextRace";
import { getCommunityPulse } from "@/lib/supabase/communityPulse";
import { getSession } from "@/lib/session/getSession";
import { getCurrentSeason } from "@/lib/currentSeason";
import { pageMetadata } from "@/lib/seo";
import { getCommunityWeekend, getCrowdVsModel } from "@/lib/supabase/communityWeekend";
import { modelPickFor, type ModelPick } from "@/lib/communityWeekend";
import type { PredictionType } from "@/lib/groupPredictionTypes";
import type { RaceDoc } from "@/lib/types/race";
import { getCallableRace } from "@/lib/supabase/postCalls";

/** The rounds a prediction can still be opened on: this season's own races that haven't finished,
 * in calendar order. Exactly what createPrediction will accept (it rejects a completed race
 * server-side), so the composer's picker can't offer something the server will refuse.
 *
 * getNextRace itself now lives in lib/supabase/nextRace.ts - a single community's own context rail
 * renders the same widget, and a copied photo-fallback chain is how two callers drift apart. */
async function getRaceContext(season: number) {
  const races = await getRaceScheduleByYear(season);
  const upcomingRaces = races
    .filter((r) => r.status !== "completed")
    .sort((a, b) => a.round - b.round)
    .map((r) => ({ id: r.id, name: r.name, round: r.round, status: r.status }));
  return { nextRace: await getNextRace(races), upcomingRaces };
}

/**
 * Driver rosters for exactly the races the viewer's own open rounds reference - the same handful of
 * small fetches a community's own page already does (see groups/_community/CommunityView.tsx), not the whole
 * season.
 *
 * This is what lets a prediction be entered from the feed itself. Without a real roster the card
 * could only ever link away to the community page, which is what "Enter prediction" used to do -
 * a navigation dressed up as an action. getRaceRoster is what keeps that roster real even for a
 * race the pipeline hasn't reached yet - see its own comment.
 */
async function getDriversAndModelByRace(raceIds: string[]): Promise<{
  driversByRace: Record<string, { code: string; name: string; headshotUrl: string | null; team: string }[]>;
  modelByRace: Record<string, Partial<Record<PredictionType, ModelPick>>>;
}> {
  const unique = [...new Set(raceIds)];
  const races = await Promise.all(unique.map((raceId) => getRaceById(raceId).catch(() => null)));
  const rosters = await Promise.all(races.map((race) => (race ? getRaceRoster(race) : [])));
  // Current roster first, the archive for anyone that misses (a departed driver a season-opener's
  // previous-year fallback roster pulled in) - see getDriverHeadshotsByCode's own comment.
  const headshotByCode = await getDriverHeadshotsByCode(rosters.flat().map((r) => r.driver));
  const driversByRace: Record<string, { code: string; name: string; headshotUrl: string | null; team: string }[]> = {};
  const modelByRace: Record<string, Partial<Record<PredictionType, ModelPick>>> = {};
  unique.forEach((raceId, i) => {
    driversByRace[raceId] = rosters[i].map((r) => ({ code: r.driver, name: r.driverName, headshotUrl: headshotByCode.get(r.driver) ?? null, team: r.team }));
    const race: RaceDoc | null = races[i];
    const picks: Partial<Record<PredictionType, ModelPick>> = {};
    for (const type of ["winner", "podium", "pole", "fastest_lap"] as PredictionType[]) {
      const pick = modelPickFor(type, race);
      if (pick) picks[type] = pick;
    }
    modelByRace[raceId] = picks;
  });
  return { driversByRace, modelByRace };
}

/** Groups home - feed-first (see GroupsHomeClient's own comment for the full reasoning). Every
 * section fetched in parallel; a failure in any one degrades to that section's own empty state
 * rather than failing this whole page (an empty predictions/next-race list already reads fine as
 * "nothing right now" - Promise.all only needs to not fully reject, and none of these four throws
 * for "no data", only for a real query error, so any real failure still surfaces normally). */
type GroupsSearchParams = Promise<{ id?: string; tab?: string; post?: string; comment?: string; invite?: string }>;

const one = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

export async function generateMetadata({ searchParams }: { searchParams: GroupsSearchParams }): Promise<Metadata> {
  const id = one((await searchParams).id);
  if (id) return communityMetadata(id);
  return pageMetadata({
    title: "Communities",
    description: "Prediction leagues and F1 communities: pick the podium every Grand Prix with friends and see who reads the sport best.",
    path: "/communities",
  });
}

export default async function GroupsPage({ searchParams }: { searchParams: GroupsSearchParams }) {
  const session = await getSession();
  const params = await searchParams;
  const id = one(params.id);
  if (!session.uid) {
    // Someone opening a shared link or an invitation is told which community it is, not shown the generic pitch.
    const preview = id && isUuid(id) ? await getGroupPreview(id).catch(() => null) : null;
    const invited = !!one(params.invite);
    return (
      <div className={id ? "page-narrow py-10" : "page-wide py-8"}>
        <SignInGate
          label={id ? "this community" : "your communities"}
          title={preview ? (invited ? `You're invited to ${preview.name}` : preview.name) : undefined}
          lead={preview ? `Sign in to ${invited ? "accept the invitation" : preview.visibility === "public" ? "join" : "see how to join"}. It's free.` : undefined}
        />
      </div>
    );
  }

  // One community (`/groups?id=`). Keyed, so opening a different community shows its skeleton at once instead of
  // holding the previous page until the new one has loaded.
  if (id) {
    return (
      <Suspense
        key={id}
        fallback={<CommunityDetailSkeleton />}
      >
        <CommunityView id={id} tab={one(params.tab)} post={one(params.post)} comment={one(params.comment)} invite={one(params.invite)} />
      </Suspense>
    );
  }

  return (
    <Suspense
      key="home"
      fallback={
        <div role="status" className="page-wide skeleton-delay">
          <span className="sr-only">Loading communities</span>
          <GroupsHomeSkeleton />
        </div>
      }
    >
      <GroupsHome uid={session.uid} />
    </Suspense>
  );
}

async function GroupsHome({ uid }: { uid: string }) {
  const [season, memberships] = await Promise.all([getCurrentSeason(), getUserMemberships(uid)]);
  const groupIds = [...new Set(memberships.map((m) => m.group_id))];

  // Start all section queries in parallel immediately on the server so none waits in a waterfall,
  // then only await `groups` for the app shell while each widget's own <Suspense> boundary replaces
  // its skeleton independently as its promise resolves.
  const groupsPromise = getUserGroups(uid, { memberships, includeStandings: false });
  const crowdVsModelPromise = groupsPromise.then((groups) =>
    getCrowdVsModel(
      groups.map((g) => ({ id: g.id, name: g.name, avatarUrl: g.avatarUrl })),
      season,
    ).catch((err) => {
      console.error("getCrowdVsModel:", err);
      return null;
    }),
  );
  const feedPromise = listFeedPosts(uid, { joinedGroupIds: groupIds });
  const predictionsBundlePromise = listMyPredictions(uid, 5, { groupIds }).then(async (predictions) => {
    const raceIds = predictions.map((p) => p.raceId);
    const trendIds = predictions.filter((p) => p.entryCount > 0).map((p) => p.id);
    const [{ driversByRace, modelByRace }, initialTrends] = await Promise.all([
      getDriversAndModelByRace(raceIds),
      trendIds.length > 0
        ? getPredictionTrends(trendIds, uid, { memberGroupIds: groupIds }).catch(() => ({}) as Record<string, PredictionTrend>)
        : Promise.resolve({} as Record<string, PredictionTrend>),
    ]);
    return { predictions, driversByRace, modelByRace, initialTrends };
  });
  const raceContextPromise = getRaceContext(season);
  // Reads the previous visit timestamp and stamps a new one - so it must run exactly once per
  // page load, here, not inside a client component that could re-run and collapse the window.
  const pulsePromise = getCommunityPulse(uid, { groupIds });
  // A few public communities to suggest (the same cached query the Discover sheet uses).
  const suggestionsPromise = groupsPromise
    .then((groups) =>
      discoverCommunities({
        uid,
        limit: 12,
        memberGroupIds: groupIds,
        memberTopics: groups.map((g) => g.topic).filter((t): t is string => !!t),
      }),
    )
    .then((d) => d.communities.filter((c) => !c.isMember).slice(0, 3))
    .catch(() => []);
  // Race-weekend mode: the weekend the section lives in, its sessions and results. Read-only; on a failure the page
  // falls back to the plain race strip rather than failing.
  const weekendPromise = getCommunityWeekend(uid, season, undefined, { groupIds }).catch((err) => {
    console.error("getCommunityWeekend:", err);
    return null;
  });
  // Takes with receipts: the race calls can be made on now, if any. A failure just hides "Make a call".
  const callableRacePromise = getCallableRace(season).catch(() => null);

  const groups = await groupsPromise;

  return (
    // The same frame as every page, without its vertical padding: GroupsHomeClient is an app shell that fills the
    // window under the header from lg, with only the feed scrolling.
    <div className="page-wide">
      <div>
        <GroupsHomeClient
          groups={groups}
          initialFeed={feedPromise}
          predictionsBundle={predictionsBundlePromise}
          raceContext={raceContextPromise}
          pulse={pulsePromise}
          weekend={weekendPromise}
          crowdVsModel={crowdVsModelPromise}
          callableRace={callableRacePromise}
          suggestions={suggestionsPromise}
        />
      </div>
    </div>
  );
}
