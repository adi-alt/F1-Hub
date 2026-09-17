"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { useNestedLenisScroll } from "@/components/motion/useLenisContainer";
import type { FeedPost } from "@/lib/supabase/groupPosts";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import type { GroupSummary } from "@/lib/supabase/groups";
import { useRegisterApexScope } from "@/components/apex/ApexScopeProvider";
import { DiscoverSheet } from "./discover/DiscoverSheet";
import { GroupsFeed } from "./GroupsFeed";
import { GroupsLeftSidebar, MobileCommunitySelector } from "./GroupsLeftSidebar";
import { GroupsRightSidebar } from "./GroupsRightSidebar";

type NextRace = { year: number; round: number; name: string; raceDate: string | null } | null;

/** Groups is now feed-first: the center column (real posts across every group you've joined) is
 * the actual content, the left sidebar is navigation (your groups + create/discover), the right
 * sidebar is F1 context (real active predictions, the real next race). No more My Groups/Discover
 * Groups as separate top-level tabs - Discover is one modal away from either sidebar.
 *
 * At <lg this is a plain stacked flex column with no scroll behavior of its own - the document
 * scrolls it exactly like every other page, feed first (the actual content), then the community
 * selector, then predictions/next race below. At lg+, the page (see page.tsx) becomes a fixed-
 * height application workspace and this component's three regions each own a real, independent
 * scroll region within it (`useNestedLenisScroll` - the same primitive Archive's own card grids
 * and tables already use for exactly this), rather than one shared page scroll moving all three at
 * once. Sticky positioning (what this used before) doesn't apply here anymore: there's no longer a
 * page scroll for a rail to stick relative to. */
export function GroupsHomeClient({
  groups,
  initialPosts,
  initialCursor,
  predictions,
  nextRace,
}: {
  groups: GroupSummary[];
  initialPosts: FeedPost[];
  initialCursor: string | null;
  predictions: FeedPrediction[];
  nextRace: NextRace;
}) {
  const [showDiscover, setShowDiscover] = useState(false);
  // The one piece of real interaction state this page adds: which community (if any) the left
  // rail has selected, which is what actually feeds the center column now - see GroupsFeed's own
  // comment. Lives here because both the rail (which row is active) and the feed (which stream to
  // fetch) need it.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedCommunity = selectedId ? (groups.find((g) => g.id === selectedId) ?? null) : null;

  // Three independent scroll regions, not one shared page scroll (lg+ only - see this
  // component's own top comment). `centerScrollRef` doubles as a plain element ref so switching
  // communities can reset its native scrollTop directly below - re-registering the Lenis instance
  // on its own (the dependency key) tears down and recreates the smoothing layer, but never moves
  // the container's own scroll position by itself.
  const leftScrollRef = useNestedLenisScroll();
  const centerContainerRef = useRef<HTMLDivElement | null>(null);
  const setCenterLenisContainer = useNestedLenisScroll(selectedId);
  const rightScrollRef = useNestedLenisScroll();

  useEffect(() => {
    centerContainerRef.current?.scrollTo({ top: 0 });
  }, [selectedId]);

  // Two real scopes, not one that quietly ignores half its own state:
  //
  //  - "All" selected: the communities index - what you're in and what's happening across them.
  //    No communityId, so the route's own buildCommunityIndexGroundingContext re-derives the real
  //    facts (your groups, open predictions, recent feed posts) server-side from the same
  //    getUserGroups/listMyOpenPredictions/listFeedPosts queries this page's own server component
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
    // The structural change from the previous pass: neither rail is a boxed panel anymore (see
    // GroupsLeftSidebar/GroupsRightSidebar - both are now plain content, no outer card). The ONLY
    // surface line on this page is a pair of thin vertical rules bracketing the center column
    // (below), the same way an editorial layout uses a rule to separate a margin note from the
    // column it annotates - not three same-weight boxes sitting side by side.
    //
    // lg:h-full here (this component fills the fixed-height workspace page.tsx builds) and
    // lg:items-stretch (was lg:items-start) so all three grid tracks are the SAME full height,
    // which is what lets each one scroll independently within it - items-start would size every
    // column to its own content height instead, leaving nothing for "the rest" to scroll inside.
    <div className="flex flex-col gap-5 lg:grid lg:h-full lg:grid-cols-[220px_minmax(0,1fr)_280px] lg:items-stretch lg:gap-0">
      <aside className="order-2 min-h-0 lg:order-1 lg:h-full lg:pr-6">
        <div ref={leftScrollRef} className="lg:h-full lg:overflow-y-auto lg:scrollbar-hide">
          <GroupsLeftSidebar groups={groups} selectedId={selectedId} onSelect={setSelectedId} onDiscover={() => setShowDiscover(true)} />
        </div>
      </aside>

      <main className="order-1 min-h-0 min-w-0 lg:order-2 lg:h-full lg:border-l lg:border-r lg:border-[var(--f1-line)] lg:px-8">
        <div
          ref={(el) => {
            centerContainerRef.current = el;
            setCenterLenisContainer(el);
          }}
          className="space-y-4 lg:h-full lg:overflow-y-auto lg:scrollbar-hide"
        >
          <MobileCommunitySelector groups={groups} selectedId={selectedId} onSelect={setSelectedId} />
          <GroupsFeed groups={groups} initialPosts={initialPosts} initialCursor={initialCursor} selectedCommunity={selectedCommunity} />
        </div>
      </main>

      <aside className="order-3 min-h-0 lg:h-full lg:pl-6">
        <div ref={rightScrollRef} className="lg:h-full lg:overflow-y-auto lg:scrollbar-hide">
          <GroupsRightSidebar predictions={predictions} nextRace={nextRace} onDiscover={() => setShowDiscover(true)} />
        </div>
      </aside>

      <AnimatePresence>{showDiscover && <DiscoverSheet onClose={() => setShowDiscover(false)} />}</AnimatePresence>
    </div>
  );
}
