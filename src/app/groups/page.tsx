import type { Metadata } from "next";
import { SignInGate } from "@/components/auth/SignInGate";
import { GroupsHomeClient } from "./components/GroupsHomeClient";
import { getUserGroups } from "@/lib/supabase/groups";
import { listFeedPosts } from "@/lib/supabase/groupPosts";
import { listMyOpenPredictions } from "@/lib/supabase/groupPredictions";
import { getRacesByYear } from "@/lib/supabase/races";
import { getNextRace } from "@/lib/supabase/nextRace";
import { getCommunityPulse } from "@/lib/supabase/communityPulse";
import { getSession } from "@/lib/session/getSession";

/** The rounds a prediction can still be opened on: this season's own races that haven't finished,
 * in calendar order. Exactly what createPrediction will accept (it rejects a completed race
 * server-side), so the composer's picker can't offer something the server will refuse.
 *
 * getNextRace itself now lives in lib/supabase/nextRace.ts - a single community's own context rail
 * renders the same widget, and a copied photo-fallback chain is how two callers drift apart. */
async function getRaceContext() {
  const races = await getRacesByYear(new Date().getFullYear());
  const upcomingRaces = races
    .filter((r) => r.status !== "completed")
    .sort((a, b) => a.round - b.round)
    .map((r) => ({ id: r.id, name: r.name, round: r.round, status: r.status }));
  return { nextRace: await getNextRace(races), upcomingRaces };
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

  const [groups, feed, predictions, raceContext, pulse] = await Promise.all([
    getUserGroups(session.uid),
    listFeedPosts(session.uid),
    listMyOpenPredictions(session.uid),
    getRaceContext(),
    // Reads the previous visit timestamp and stamps a new one - so it must run exactly once per
    // page load, here, not inside a client component that could re-run and collapse the window.
    getCommunityPulse(session.uid),
  ]);

  return (
    // Same effective width as the Race page (max-w-[1440px] px-5 py-8 sm:px-8 lg:px-16) - not a
    // width invented for Communities alone. At <lg this is a plain block: the header takes its
    // natural height and GroupsHomeClient's own content flows underneath it, scrolled by the
    // document exactly like every other page. At lg+ it becomes a fixed-height application
    // workspace instead - the same h-[calc(100dvh-4rem)] pattern Archive's own explorer already
    // uses (4rem is the header's real height, Header.tsx's own h-16) - so the header stays put and
    // GroupsHomeClient's three regions can each scroll independently within the space that's left,
    // rather than the whole page scrolling as one long document. That split is deliberate, not a
    // half-finished responsive pass: three columns each scrolling on their own is a real desktop
    // workspace idiom, and a genuinely bad one on a phone, where it fights the one scroll gesture a
    // touch screen actually has.
    <div className="mx-auto max-w-[1440px] px-5 py-6 sm:px-8 lg:flex lg:h-[calc(100dvh-4rem)] lg:flex-col lg:overflow-hidden lg:px-10 lg:py-6">
      {/* No separate page header above the workspace anymore - the page title and its one-line
          description live at the top of the navigation rail itself (GroupsLeftSidebar), so the
          three columns start at the same baseline and the feed is the first thing at eye level
          rather than sitting a header's height below it. */}
      <div className="lg:min-h-0 lg:flex-1">
        <GroupsHomeClient
          groups={groups}
          initialPosts={feed.posts}
          initialCursor={feed.nextCursor}
          predictions={predictions}
          nextRace={raceContext.nextRace}
          upcomingRaces={raceContext.upcomingRaces}
          pulse={pulse}
        />
      </div>
    </div>
  );
}
