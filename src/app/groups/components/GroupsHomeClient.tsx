"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { FeedPost } from "@/lib/supabase/groupPosts";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import type { GroupSummary } from "@/lib/supabase/groups";
import { useRegisterApexScope } from "@/components/apex/ApexScopeProvider";
import { DiscoverSheet } from "./discover/DiscoverSheet";
import { GroupsFeed } from "./GroupsFeed";
import { GroupsLeftSidebar } from "./GroupsLeftSidebar";
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

  // The communities index: what you're in and what's happening across them. Sends only selection
  // state (no communityId - this scope isn't about any one community) - the route's own
  // buildCommunityIndexGroundingContext re-derives the real facts (your groups, open predictions,
  // recent feed posts) server-side from the same getUserGroups/listMyOpenPredictions/listFeedPosts
  // queries this page's own server component already used, rather than trusting this client
  // snapshot. Same rule every other page's scope already follows (Season/Archive/Circuit) - this
  // one used to be the exception, computing and sending the facts itself with no server builder to
  // catch it; nothing here is trusted for facts anymore, only for "what page/tab is open."
  useRegisterApexScope({
    key: "communities-index",
    label: "Your communities",
    sublabel: `${groups.length} joined`,
    suggestions: ["What's happening across my communities?", "Which predictions close soonest?", "Which of my communities is most active?"],
    context: {
      page: "community",
      snapshot: { view: "index" },
    },
  });

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[240px_minmax(0,1fr)_300px] lg:gap-5 lg:items-start">
      <aside className="order-2 lg:order-1 lg:sticky lg:top-4">
        <GroupsLeftSidebar groups={groups} onDiscover={() => setShowDiscover(true)} />
      </aside>

      <main className="order-1 min-w-0 lg:order-2">
        <GroupsFeed groups={groups} initialPosts={initialPosts} initialCursor={initialCursor} />
      </main>

      <aside className="order-3 lg:sticky lg:top-4">
        <GroupsRightSidebar predictions={predictions} nextRace={nextRace} />
        <button onClick={() => setShowDiscover(true)} className="mt-3 block w-full text-center text-xs text-neutral-500 transition hover:text-white">
          Discover more communities →
        </button>
      </aside>

      <AnimatePresence>{showDiscover && <DiscoverSheet onClose={() => setShowDiscover(false)} />}</AnimatePresence>
    </div>
  );
}
