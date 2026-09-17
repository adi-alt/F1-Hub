"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
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
 * Responsive via order-* on one flex/grid, not three separately-maintained layouts: mobile stacks
 * feed first (the actual content), then the groups list, then predictions/next race below - a
 * real, considered order, not the desktop grid simply squished into one column. lg+ becomes the
 * real three-column layout, both sidebars sticky under the header. */
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

  // The communities index: what you're in and what's happening across them. Sends only selection
  // state (which community the rail has selected, if any - not communityId as "this is a
  // community page", just "this UI element is focused") - the route's own
  // buildCommunityIndexGroundingContext re-derives the real facts (your groups, open predictions,
  // recent feed posts) server-side from the same getUserGroups/listMyOpenPredictions/listFeedPosts
  // queries this page's own server component already used, rather than trusting this client
  // snapshot. Same rule every other page's scope already follows (Season/Archive/Circuit) - this
  // one used to be the exception, computing and sending the facts itself with no server builder to
  // catch it; nothing here is trusted for facts anymore, only for "what's currently in view."
  useRegisterApexScope({
    key: "communities-index",
    label: "Your communities",
    sublabel: `${groups.length} joined`,
    suggestions: ["What's happening across my communities?", "Which predictions close soonest?", "Which of my communities is most active?"],
    context: {
      page: "community",
      snapshot: { view: "index", selectedCommunityId: selectedId },
    },
  });

  return (
    // The structural change this pass makes: neither rail is a boxed panel anymore (see
    // GroupsLeftSidebar/GroupsRightSidebar - both are now plain content, no outer card). The ONLY
    // surface line on this page is a pair of thin vertical rules bracketing the center column
    // (below), the same way an editorial layout uses a rule to separate a margin note from the
    // column it annotates - not three same-weight boxes sitting side by side. That's what actually
    // stops this from reading as "left card + center card + right card": there are no side cards
    // left to read as one.
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[220px_minmax(0,1fr)_280px] lg:gap-0 lg:items-start">
      <aside className="order-2 lg:order-1 lg:sticky lg:top-4 lg:pr-6">
        <GroupsLeftSidebar groups={groups} selectedId={selectedId} onSelect={setSelectedId} onDiscover={() => setShowDiscover(true)} />
      </aside>

      <main className="order-1 min-w-0 space-y-4 lg:order-2 lg:border-l lg:border-r lg:border-[var(--f1-line)] lg:px-8">
        <MobileCommunitySelector groups={groups} selectedId={selectedId} onSelect={setSelectedId} />
        <GroupsFeed groups={groups} initialPosts={initialPosts} initialCursor={initialCursor} selectedCommunity={selectedCommunity} />
      </main>

      <aside className="order-3 lg:sticky lg:top-4 lg:pl-6">
        <GroupsRightSidebar predictions={predictions} nextRace={nextRace} onDiscover={() => setShowDiscover(true)} />
      </aside>

      <AnimatePresence>{showDiscover && <DiscoverSheet onClose={() => setShowDiscover(false)} />}</AnimatePresence>
    </div>
  );
}
