"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { MODULE_LABELS, resolveModules, type CommunityModule } from "@/lib/communities";
import type { GroupPost } from "@/lib/supabase/groupPosts";
import type { GroupPrediction } from "@/lib/groupPredictionTypes";
import type { GroupDetail, LeaderboardRow } from "@/lib/supabase/groups";
import { CommunityFeed } from "./CommunityFeed";
import { AboutTab, MediaTab } from "./CommunityModules";
import { GroupLeaderboardTab } from "./GroupLeaderboardTab";
import { GroupMembersTab } from "./GroupMembersTab";
import { GroupPredictions } from "./GroupPredictions";

/** Manage isn't a module - it's an admin surface, so it never appears in resolveModules and is
 * appended here only for the people who can actually use it. */
type Tab = CommunityModule | "manage";

/** Narrows an arbitrary `?tab=` string against THIS community's real tabs, so
 * `?tab=predictions` on a Photography community falls through to the default rather than
 * rendering an empty panel. */
function isTab(value: string | null, tabs: Tab[]): value is Tab {
  return !!value && (tabs as string[]).includes(value);
}

/**
 * Navigation derived from the community's own enabled modules, not a hardcoded list. A Photography
 * community has no Predictions tab because resolveModules never returns one for a non-F1 type -
 * there's no per-tab `if` anywhere in this file.
 *
 * The active tab lives in the URL (`?tab=`), so a tab is linkable, survives a refresh, and the
 * browser Back button steps through tabs the way a user expects. It's written with
 * `history.pushState` rather than a router navigation: this is a view toggle over data that's
 * already loaded, and a router push would re-run the whole server component for nothing.
 */
export function CommunityTabs({
  group,
  myUserId,
  leaderboard,
  posts,
  postsCursor,
  predictions,
  races,
  driversByRace,
  pointsBalance,
  memberCount,
  initialTab,
}: {
  group: GroupDetail;
  myUserId: string;
  leaderboard: LeaderboardRow[];
  posts: GroupPost[];
  postsCursor: string | null;
  predictions: GroupPrediction[];
  races: { id: string; name: string; round: number; status: string }[];
  driversByRace: Record<string, { code: string; name: string }[]>;
  pointsBalance: number;
  memberCount: number;
  /** Server-resolved `?tab=` value, so the first render is already correct. */
  initialTab: string | null;
}) {
  const modules = resolveModules(group.communityType, group.features);
  const isAdmin = group.myRole === "admin";
  const tabs: Tab[] = isAdmin ? [...modules, "manage"] : modules;

  const defaultTab = modules[0] ?? "feed";
  // `initialTab` comes from the server's own searchParams, already validated there, so the first
  // client render matches the server exactly - no hydration mismatch, and no mount-time effect
  // reading window.location just to correct itself one render later.
  const [tab, setTab] = useState<Tab>(isTab(initialTab, tabs) ? initialTab : defaultTab);

  // The only thing left for an effect is a genuine external subscription: Back/Forward. setState
  // here runs inside the event callback, not in the effect body.
  useEffect(() => {
    function syncFromUrl() {
      const requested = new URLSearchParams(window.location.search).get("tab");
      setTab(isTab(requested, tabs) ? requested : defaultTab);
    }
    window.addEventListener("popstate", syncFromUrl);
    return () => window.removeEventListener("popstate", syncFromUrl);
    // tabs/defaultTab derive from props that are fixed for the life of this page.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [group.id]);

  function select(next: Tab) {
    setTab(next);
    const url = new URL(window.location.href);
    if (next === defaultTab) url.searchParams.delete("tab");
    else url.searchParams.set("tab", next);
    window.history.pushState(null, "", url);
  }

  return (
    <div>
      {/* Horizontally scrollable on a narrow screen rather than wrapping to two rows. */}
      <div className="-mx-1 overflow-x-auto border-b border-[var(--f1-line)] px-1">
        <div role="tablist" aria-label="Community sections" className="flex min-w-max items-center gap-1">
          {tabs.map((t) => (
            <button
              key={t}
              role="tab"
              aria-selected={tab === t}
              onClick={() => select(t)}
              className={`relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition ${
                tab === t ? "text-white" : "text-neutral-500 hover:text-neutral-300"
              }`}
            >
              {t === "manage" ? "Manage" : MODULE_LABELS[t]}
              {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--f1-red)]" />}
            </button>
          ))}
        </div>
      </div>

      <AnimatePresence mode="wait">
        <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="mt-6">
          {tab === "feed" && (
            <CommunityFeed
              groupId={group.id}
              communityName={group.name}
              communityAvatarUrl={group.avatarUrl}
              communityType={group.communityType}
              features={group.features}
              initialPosts={posts}
              initialCursor={postsCursor}
              myRole={group.myRole}
              moderationEnabled={group.moderationEnabled}
            />
          )}
          {tab === "predictions" && (
            <GroupPredictions
              groupId={group.id}
              myRole={group.myRole}
              predictions={predictions}
              races={races}
              driversByRace={driversByRace}
              pointsBalance={pointsBalance}
            />
          )}
          {tab === "leaderboard" && <GroupLeaderboardTab rows={leaderboard} myUserId={myUserId} />}
          {tab === "media" && <MediaTab groupId={group.id} />}
          {tab === "members" && <GroupMembersTab groupId={group.id} members={group.members} myRole={group.myRole} myUserId={myUserId} />}
          {tab === "about" && <AboutTab group={group} modules={modules} memberCount={memberCount} />}
          {tab === "manage" && isAdmin && <ManageTabLazy group={group} />}
        </motion.div>
      </AnimatePresence>
    </div>
  );
}

/** Manage is the heaviest panel and the least-visited, so it's only imported when an admin actually
 * opens it rather than shipped in every member's bundle. */
function ManageTabLazy({ group }: { group: GroupDetail }) {
  const [Loaded, setLoaded] = useState<React.ComponentType<{ group: GroupDetail }> | null>(null);

  useEffect(() => {
    let cancelled = false;
    void import("./manage/ManageTab").then((mod) => !cancelled && setLoaded(() => mod.ManageTab));
    return () => {
      cancelled = true;
    };
  }, []);

  if (!Loaded) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="skeleton-shimmer h-14 rounded-lg bg-white/[0.04]" />
        ))}
      </div>
    );
  }
  return <Loaded group={group} />;
}
