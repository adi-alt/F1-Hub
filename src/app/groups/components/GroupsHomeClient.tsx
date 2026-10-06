"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { FeedPost } from "@/lib/supabase/groupPosts";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import type { GroupSummary } from "@/lib/supabase/groups";
import { useRegisterApexScope } from "@/components/apex/ApexScopeProvider";
import { DiscoverSheet } from "./discover/DiscoverSheet";
import { GroupsFeed } from "./GroupsFeed";
import { GroupsLeftSidebar, MobileCommunitySelector } from "./GroupsLeftSidebar";
import { GroupsRightSidebar, type NextRace } from "./GroupsRightSidebar";
import type { RaceOption } from "./post/PredictionComposer";
import type { CommunityPulseData } from "@/lib/supabase/communityPulse";

/** Groups is now feed-first: the center column (real posts across every group you've joined) is
 * the actual content, the left sidebar is navigation (your groups + create/discover), the right
 * sidebar is F1 context (real active predictions, the real next race). No more My Groups/Discover
 * Groups as separate top-level tabs - Discover is one modal away from either sidebar.
 *
 * At <lg this is a plain stacked flex column with no scroll behavior of its own - the document
 * scrolls it exactly like every other page, feed first (the actual content), then the community
 * selector, then predictions/next race below. At lg+ it is three columns on the one document scroll
 * (audit R-31): the feed flows with the page, and the two rails are sticky beside it, so they stay in
 * view. Only the community list inside the left rail scrolls on its own, when there are more
 * communities than fit. */
export function GroupsHomeClient({
  groups,
  initialPosts,
  initialCursor,
  predictions,
  nextRace,
  upcomingRaces,
  pulse,
  driversByRace,
}: {
  groups: GroupSummary[];
  initialPosts: FeedPost[];
  initialCursor: string | null;
  predictions: FeedPrediction[];
  nextRace: NextRace;
  upcomingRaces: RaceOption[];
  pulse: CommunityPulseData;
  /** Driver roster per race id, for the open rounds shown in the feed. */
  driversByRace: Record<string, { code: string; name: string; headshotUrl: string | null }[]>;
}) {
  const [showDiscover, setShowDiscover] = useState(false);
  // The one piece of real interaction state this page adds: which community (if any) the left
  // rail has selected, which is what actually feeds the center column now - see GroupsFeed's own
  // comment. Lives here because both the rail (which row is active) and the feed (which stream to
  // fetch) need it.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedCommunity = selectedId ? (groups.find((g) => g.id === selectedId) ?? null) : null;

  // Picking another community swaps the feed, so bring its top into view: the page scrolls now, and the
  // rail you picked it from is sticky, so you may be many posts down. Not on first render.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    window.scrollTo({ top: 0 });
  }, [selectedId]);

  // Two real scopes, not one that quietly ignores half its own state:
  //
  //  - "All" selected: the communities index - what you're in and what's happening across them.
  //    No communityId, so the route's own buildCommunityIndexGroundingContext re-derives the real
  //    facts (your groups, open predictions, recent feed posts) server-side from the same
  //    getUserGroups/listMyPredictions/listFeedPosts queries this page's own server component
  //    already used.
  //  - a community selected: communityId is set, which routes the SAME request through
  //    buildCommunityGroundingContext instead - the exact server builder the community's own page
  //    uses (getGroupDetail + requireMember, real membership-verified data), not a second, weaker
  //    version built for this page alone. snapshot.community.currentTab mirrors CommunityTabs.tsx's
  //    own shape ("feed" - this rail shows that community's feed, nothing else) so one builder
  //    serves both surfaces without needing to know which one asked.
  //
  // Either way, nothing here is trusted for facts, only for "what's currently in view" - and the
  // suggestions only ever promise what that specific server builder can actually answer.
  const scopeKey = selectedCommunity ? `community:${selectedCommunity.id}` : "communities-index";
  useRegisterApexScope(
    selectedCommunity
      ? {
          key: scopeKey,
          label: selectedCommunity.name,
          sublabel: "Feed",
          communityId: selectedCommunity.id,
          suggestions: ["What is this community discussing most?", "Summarise the recent posts here.", "Are there any open predictions in this community?"],
          context: {
            page: "community",
            snapshot: { community: { currentTab: "feed" } },
          },
        }
      : {
          key: scopeKey,
          label: "Your communities",
          sublabel: `${groups.length} joined`,
          suggestions: ["What's happening across my communities?", "Which predictions close soonest?", "Which of my communities is most active?"],
          context: {
            page: "community",
            snapshot: { view: "index" },
          },
        },
  );

  return (
    // Three columns, each its own frosted surface starting at the same top baseline - navigation,
    // the conversation, race context - sized so the centre is unmistakably the widest and the
    // rails read as supporting it. The rails are sticky (top-20 = the 4rem header plus a gap) and
    // capped to the viewport, so a tall rail scrolls inside itself instead of running off-screen.
    <div className="flex flex-col gap-3 lg:grid lg:grid-cols-[248px_minmax(0,1fr)_296px] lg:items-start lg:gap-3">
      <aside aria-label="Your communities" className="order-2 lg:sticky lg:top-20 lg:order-1">
        <GroupsLeftSidebar groups={groups} selectedId={selectedId} onSelect={setSelectedId} onDiscover={() => setShowDiscover(true)} />
      </aside>

      {/* A div, not a second <main>: the root layout already has the page's one main landmark. */}
      <div className="order-1 min-w-0 lg:order-2">
        {/* Below lg the rail, and the h1 in it, are hidden, so the page keeps a heading here. */}
        <h1 className="sr-only lg:hidden">Communities</h1>
        <div className="space-y-2.5">
          <MobileCommunitySelector groups={groups} selectedId={selectedId} onSelect={setSelectedId} />
          <GroupsFeed groups={groups} initialPosts={initialPosts} initialCursor={initialCursor} selectedCommunity={selectedCommunity} predictions={predictions} upcomingRaces={upcomingRaces} driversByRace={driversByRace} />
        </div>
      </div>

      <aside aria-label="Race weekend and activity" className="order-3 lg:sticky lg:top-20">
        <GroupsRightSidebar groups={groups} predictions={predictions} nextRace={nextRace} pulse={pulse} onDiscover={() => setShowDiscover(true)} />
      </aside>

      <AnimatePresence>{showDiscover && <DiscoverSheet onClose={() => setShowDiscover(false)} />}</AnimatePresence>
    </div>
  );
}
