"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useRegisterApexScope } from "@/components/apex/ApexScopeProvider";
import { canDo, MODULE_LABELS, resolveModules, type CommunityModule } from "@/lib/communities";
import type { GroupPost } from "@/lib/supabase/groupPosts";
import type { GroupPrediction } from "@/lib/groupPredictionTypes";
import type { GroupDetail, LeaderboardRow } from "@/lib/supabase/groups";
import type { GroupPulse, GroupStats } from "@/lib/supabase/groupStats";
import type { NextRaceSummary } from "@/lib/supabase/nextRace";
import type { RaceOption } from "../../components/post/PredictionComposer";
import { CommunityFeed } from "./CommunityFeed";
import { CommunityHeader } from "./CommunityHeader";
import { AboutTab, MediaTab } from "./CommunityModules";
import { CommunityRightRail, type RailPrediction } from "./CommunityRightRail";
import { GroupLeaderboardTab } from "./GroupLeaderboardTab";
import { GroupMembersTab } from "./GroupMembersTab";
import { GroupPredictions } from "./GroupPredictions";

/** Manage isn't a module - it's an admin surface, so it never appears in resolveModules and is
 * appended here only for the people who can actually use it. */
type Tab = CommunityModule | "manage";

/** Narrows an arbitrary `?tab=` string against THIS community's real tabs, so `?tab=predictions`
 * on a Photography community falls through to the default rather than rendering an empty panel. */
function isTab(value: string | null, tabs: Tab[]): value is Tab {
  return !!value && (tabs as string[]).includes(value);
}

/**
 * The community page itself: identity, navigation, the active panel, and the context rail beside
 * them.
 *
 * Navigation is derived from the community's own enabled modules, not a hardcoded list. A
 * Photography community has no Predictions tab because resolveModules never returns one for a
 * non-F1 type - there's no per-tab `if` anywhere in this file.
 *
 * The active tab lives in the URL (`?tab=`), so a tab is linkable, survives a refresh, and the
 * browser Back button steps through tabs the way a user expects. It's written with
 * `history.pushState` rather than a router navigation: this is a view toggle over data that's
 * already loaded, and a router push would re-run the whole server component for nothing.
 *
 * Tab state lives HERE rather than in a tab strip of its own because three things need it now: the
 * strip, the panel, and the rail (whose "View all" links point at real tabs beside them). Lifting
 * it any higher would mean making the server component interactive; leaving it lower would mean
 * the rail navigating by URL and re-rendering a page whose data is already on screen.
 */
export function CommunityWorkspace({
  group,
  myUserId,
  leaderboard,
  posts,
  postsCursor,
  predictions,
  railPredictions,
  races,
  upcomingRaces,
  driversByRace,
  pointsBalance,
  memberCount,
  stats,
  pulse,
  nextRace,
  pendingRequests,
  pendingPosts,
  initialTab,
  focusPostId,
  isF1,
}: {
  group: GroupDetail;
  myUserId: string;
  leaderboard: LeaderboardRow[];
  posts: GroupPost[];
  postsCursor: string | null;
  predictions: GroupPrediction[];
  railPredictions: RailPrediction[];
  /** Every round of this season, newest first - what the Predictions tab's own picker offers. */
  races: RaceOption[];
  /** The subset that hasn't run yet, which is exactly what createPrediction will accept. The
   * composer gets this one, so it can't offer a round the server would refuse. */
  upcomingRaces: RaceOption[];
  driversByRace: Record<string, { code: string; name: string }[]>;
  pointsBalance: number;
  memberCount: number;
  stats: GroupStats;
  pulse: GroupPulse;
  nextRace: NextRaceSummary;
  pendingRequests?: number;
  pendingPosts?: number;
  /** Server-resolved `?tab=` value, so the first render is already correct. */
  initialTab: string | null;
  /** Server-resolved `?post=` value from a shared post permalink. */
  focusPostId: string | null;
  /** Whether this community is about Formula 1 at all. Decides whether the race card exists - an
   * F1 community with nothing scheduled still gets the card (saying so); a Photography community
   * never gets one, and the page never even fetches a race for it. */
  isF1: boolean;
}) {
  const isAdmin = group.myRole === "admin";
  // Memoized because `openTab` below closes over it: a fresh array every render would give that
  // callback a new identity every render, and it's passed into the rail.
  const modules = useMemo(() => resolveModules(group.communityType, group.features), [group.communityType, group.features]);
  const tabs: Tab[] = useMemo(() => (isAdmin ? [...modules, "manage"] : modules), [isAdmin, modules]);

  const defaultTab = modules[0] ?? "feed";
  // `initialTab` comes from the server's own searchParams, already validated there, so the first
  // client render matches the server exactly - no hydration mismatch, and no mount-time effect
  // reading window.location just to correct itself one render later.
  const [tab, setTab] = useState<Tab>(isTab(initialTab, tabs) ? initialTab : defaultTab);
  // The full-post modal. Owned here, not in the feed, because the floating "Create post" button is
  // fixed to the viewport and lives outside the feed panel entirely.
  const [composerOpen, setComposerOpen] = useState(false);

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

  // What Apex sees inside a community - only WHICH community and WHICH tab, both safe UI selection
  // state. The route's own buildCommunityGroundingContext resolves the real facts server-side via
  // the same requireMember-gated functions this page renders from, never trusting this client
  // snapshot for content.
  //
  // `key` deliberately does NOT include `tab`: switching Feed -> Predictions -> Leaderboard is
  // still the same community and the same conversation. The context object below still updates on
  // every tab change, so Apex never answers from a stale tab - it just doesn't forget the
  // conversation to get there.
  useRegisterApexScope({
    key: `community:${group.id}`,
    label: group.name,
    sublabel: tab === "manage" ? "Manage" : MODULE_LABELS[tab as CommunityModule],
    communityId: group.id,
    suggestions: [
      "Summarise what people are discussing here.",
      ...(modules.includes("predictions") ? ["Which prediction rounds are still open?"] : []),
      "What kind of community is this?",
    ],
    context: {
      page: "community",
      snapshot: {
        community: { currentTab: tab },
      },
    },
  });

  const select = useCallback(
    (next: Tab) => {
      setTab(next);
      const url = new URL(window.location.href);
      if (next === defaultTab) url.searchParams.delete("tab");
      else url.searchParams.set("tab", next);
      window.history.pushState(null, "", url);
    },
    [defaultTab],
  );

  /** The rail points at tabs beside it. A target this community doesn't have (a rail card is only
   * rendered when its module is on, but Members/About are required and always exist) falls through
   * to doing nothing rather than switching to a panel that isn't there. */
  const openTab = useCallback(
    (next: "predictions" | "members" | "about" | "feed") => {
      if (!(tabs as string[]).includes(next)) return;
      select(next as Tab);
    },
    [select, tabs],
  );

  const canPost = canDo(group.permissions, "post", group.myRole);
  const showRail = tab !== "manage";

  return (
    <>
      {/* One grid for the whole page body, so the rail's first card starts at the same baseline as
          the cover image rather than below a full-width header. Below lg it collapses to a single
          column and the rail follows the feed, which is the right order on a phone: the content
          first, the context under it. */}
      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <div className="min-w-0">
          <CommunityHeader group={group} memberCount={memberCount} pendingRequests={pendingRequests} onOpenManage={() => select("manage")} />

          <div className="mt-6">
            {/* Horizontally scrollable on a narrow screen rather than wrapping to two rows. */}
            <div className="-mx-1 overflow-x-auto border-b border-[var(--f1-line)] px-1 scrollbar-hide">
              <div role="tablist" aria-label="Community sections" className="flex min-w-max items-center gap-1">
                {tabs.map((t) => (
                  <button
                    key={t}
                    role="tab"
                    aria-selected={tab === t}
                    onClick={() => select(t)}
                    className={`relative whitespace-nowrap px-3 py-2.5 text-sm font-medium transition ${tab === t ? "text-white" : "text-neutral-500 hover:text-neutral-300"}`}
                  >
                    {t === "manage" ? "Manage" : MODULE_LABELS[t]}
                    {tab === t && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--f1-red)]" />}
                  </button>
                ))}
              </div>
            </div>

            <AnimatePresence mode="wait">
              <motion.div key={tab} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} transition={{ duration: 0.18 }} className="mt-5">
                {tab === "feed" && (
                  <CommunityFeed
                    groupId={group.id}
                    communityName={group.name}
                    communityAvatarUrl={group.avatarUrl}
                    communityDescription={group.description}
                    communityType={group.communityType}
                    features={group.features}
                    permissions={group.permissions}
                    initialPosts={posts}
                    initialCursor={postsCursor}
                    myRole={group.myRole}
                    moderationEnabled={group.moderationEnabled}
                    pendingCount={pendingPosts}
                    upcomingRaces={upcomingRaces}
                    composerOpen={composerOpen}
                    onComposerOpenChange={setComposerOpen}
                    focusPostId={focusPostId}
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
        </div>

        {/* Manage is a full-width settings surface with its own two-column layout; a context rail
            beside it would be competing for the same space and pointing at panels the admin has
            deliberately left. */}
        {showRail && (
          <aside className="mt-6 lg:sticky lg:top-4 lg:mt-0">
            <CommunityRightRail
              groupId={group.id}
              stats={stats}
              pulse={pulse}
              race={nextRace}
              predictions={railPredictions}
              showRace={isF1}
              showPredictions={modules.includes("predictions")}
              onOpenTab={openTab}
            />
          </aside>
        )}
      </div>

      {/* Fixed, bottom-right - the opposite corner from Ask Apex's own launcher, so the two can
          never collide. Only on the Feed tab, and only for someone this community actually lets
          post: a button that opens a composer the server would refuse is worse than no button. */}
      {tab === "feed" && canPost && (
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="fixed bottom-5 right-5 z-30 flex items-center gap-2 rounded-full bg-[var(--f1-red)] px-4 py-3 text-[13px] font-semibold text-white shadow-lg shadow-black/40 transition hover:brightness-110 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] sm:px-5"
        >
          <svg viewBox="0 0 14 14" width="13" height="13" fill="none" aria-hidden>
            <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" />
          </svg>
          <span className="hidden sm:inline">Create post</span>
          <span className="sr-only sm:hidden">Create post</span>
        </button>
      )}
    </>
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
