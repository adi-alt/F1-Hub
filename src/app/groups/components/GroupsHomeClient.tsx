"use client";

import { useState } from "react";
import { AnimatePresence } from "framer-motion";
import type { FeedPost } from "@/lib/supabase/groupPosts";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import type { GroupSummary } from "@/lib/supabase/groups";
import { DiscoverModal } from "./DiscoverModal";
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

  return (
    <div className="flex flex-col gap-5 lg:grid lg:grid-cols-[220px_minmax(0,1fr)_300px] lg:items-start">
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

      <AnimatePresence>{showDiscover && <DiscoverModal onClose={() => setShowDiscover(false)} />}</AnimatePresence>
    </div>
  );
}
