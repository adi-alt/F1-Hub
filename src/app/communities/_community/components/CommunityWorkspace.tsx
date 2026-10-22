"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CallableRace } from "@/lib/supabase/postCalls";
import { motion } from "motion/react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { useRegisterApexScope } from "@/components/apex/ApexScopeProvider";
import { TabList, TabPanels, Tabs, type TabItem } from "@/components/ui/Tabs";
import { canDo, MODULE_LABELS, resolveModules, type CommunityModule } from "@/lib/communities";
import type { GroupPost } from "@/lib/supabase/groupPosts";
import type { GroupPrediction } from "@/lib/groupPredictionTypes";
import type { GroupDetail, LeaderboardRow } from "@/lib/supabase/groups";
import type { GroupPulse, GroupStats } from "@/lib/supabase/groupStats";
import type { NextRaceSummary } from "@/lib/supabase/nextRace";
import type { RaceOption } from "../../components/post/PredictionComposer";
import { CommunityFeed } from "./CommunityFeed";
import { CommunityHeader, type CommunityWindow } from "./CommunityHeader";
import { Dialog } from "@/components/ui/Dialog";
import { AboutTab, MediaTab } from "./CommunityModules";
import { CommunityRightRail, type RailPrediction, type RailTab } from "./CommunityRightRail";
import type { CommunityWeekendData, CrowdVsModel } from "@/lib/supabase/communityWeekend";
import { GroupLeaderboardTab } from "./GroupLeaderboardTab";
import { GroupMembersTab, managesMembers } from "./GroupMembersTab";
import { GroupPredictions } from "./GroupPredictions";

/** Manage isn't a module - it's an admin surface, so it never appears in resolveModules and is
 * appended here only for the people who can actually use it. */
type Tab = CommunityModule | "manage";

/** Narrows an arbitrary `?tab=` string against THIS community's real tabs, so `?tab=predictions`
 * on a Photography community falls through to the default rather than rendering an empty panel. */
function isTab(value: string | null, tabs: Tab[]): value is Tab {
  return !!value && (tabs as string[]).includes(value);
}

/** The sections that open as a window over the page instead of replacing the feed: secondary reading (media,
 * members, about) and the admin's settings. The page's own tabs are the competitive ones: feed, predictions, league. */
const WINDOWS: readonly CommunityWindow[] = ["media", "members", "about", "invite", "manage"];
const isWindow = (value: string | null): value is CommunityWindow => !!value && (WINDOWS as readonly string[]).includes(value);

const WINDOW_TITLES: Record<CommunityWindow, string> = { media: "Media", members: "Members", about: "About", invite: "Manage members", manage: "Manage community" };

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
  callableRace = null,
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
  weekend = null,
  crowdVsModel = null,
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
  /** This weekend's race while calls on it are open (takes with receipts). */
  callableRace?: CallableRace | null;
  driversByRace: Record<string, { code: string; name: string; headshotUrl: string | null }[]>;
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
  /** The race weekend this community is living in (F1 communities): the bar above the feed, session tags, results. */
  weekend?: CommunityWeekendData;
  /** This community against the Apex model this season. */
  crowdVsModel?: CrowdVsModel | null;
}) {
  const isAdmin = group.myRole === "admin";
  const canInvite = canDo(group.permissions, "invite", group.myRole);
  // A moderator manages the door (join requests); everything else in Manage is an admin's.
  const canManage = isAdmin || (group.myRole === "moderator" && (group.visibility === "private" || (pendingRequests ?? 0) > 0));
  // Memoized because `openTab` below closes over it: a fresh array every render would give that
  // callback a new identity every render, and it's passed into the rail.
  const modules = useMemo(() => resolveModules(group.communityType, group.features), [group.communityType, group.features]);
  const tabs: Tab[] = useMemo(() => modules.filter((m) => !isWindow(m)), [modules]);
  const windows: CommunityWindow[] = useMemo(() => {
    const own: CommunityWindow[] = modules.filter((m): m is CommunityModule & CommunityWindow => isWindow(m));
    return [...own, ...(canInvite ? (["invite"] as const) : []), ...(canManage ? (["manage"] as const) : [])];
  }, [canInvite, canManage, modules]);
  // Counts where a count is the useful thing to know before opening a tab.
  const openRoundCount = predictions.filter((p) => p.state === "open").length;
  const tabCount: Partial<Record<Tab, number>> = { predictions: openRoundCount || undefined };
  const tabItems: TabItem<Tab>[] = tabs.map((t) => ({ value: t, label: t === "manage" ? "Manage" : MODULE_LABELS[t], count: tabCount[t] }));

  const defaultTab = modules[0] ?? "feed";
  // `initialTab` comes from the server's own searchParams, already validated there, so the first
  // client render matches the server exactly - no hydration mismatch, and no mount-time effect
  // reading window.location just to correct itself one render later.
  const [tab, setTab] = useState<Tab>(isTab(initialTab, tabs) ? initialTab : defaultTab);
  // A `?tab=members` link (or the rail's "Members") opens the window over the feed.
  const [win, setWin] = useState<CommunityWindow | null>(isWindow(initialTab) && windows.includes(initialTab) ? initialTab : null);
  // What the window shows: kept after it closes, so the content stays put while the dialog animates out.
  const [shown, setShown] = useState<CommunityWindow | null>(win);
  // The full-post modal. Owned here, not in the feed, because the floating "Create post" button is
  // fixed to the viewport and lives outside the feed panel entirely.
  const [composerOpen, setComposerOpen] = useState(false);
  // A window this person can no longer open (a role changed under them) closes rather than showing an empty dialog.
  if (win && !windows.includes(win)) setWin(null);

  // The only thing left for an effect is a genuine external subscription: Back/Forward. setState
  // here runs inside the event callback, not in the effect body.
  useEffect(() => {
    function syncFromUrl() {
      const requested = new URLSearchParams(window.location.search).get("tab");
      if (isWindow(requested) && windows.includes(requested)) {
        setWin(requested);
        setShown(requested);
        return;
      }
      setWin(null);
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
    sublabel: win ? WINDOW_TITLES[win] : MODULE_LABELS[tab as CommunityModule],
    communityId: group.id,
    suggestions: [
"Summarise what people are discussing here.",
      ...(modules.includes("predictions") ? ["Which prediction rounds are still open?"] : []),
"What kind of community is this?",
    ],
    context: {
      page: "community",
      snapshot: {
        community: { currentTab: win ?? tab },
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

  /** A window is linkable like a tab (`?tab=members`); closing it puts the URL back to the tab underneath. */
  const openWindow = useCallback((next: CommunityWindow) => {
    setWin(next);
    setShown(next);
    const url = new URL(window.location.href);
    url.searchParams.set("tab", next);
    window.history.pushState(null, "", url);
  }, []);
  // Manage's unsaved edits: closing asks first instead of dropping them.
  const manageDirty = useRef(false);
  const [askDiscard, setAskDiscard] = useState(false);
  const closeWindow = useCallback(() => {
    if (manageDirty.current && !askDiscard) {
      setAskDiscard(true);
      return;
    }
    setAskDiscard(false);
    manageDirty.current = false;
    setWin(null);
    const url = new URL(window.location.href);
    if (tab === defaultTab) url.searchParams.delete("tab");
    else url.searchParams.set("tab", tab);
    window.history.replaceState(null, "", url);
  }, [tab, defaultTab, askDiscard]);

  /** The rail points at tabs beside it. A target this community doesn't have (a rail card is only
   * rendered when its module is on, but Members/About are required and always exist) falls through
   * to doing nothing rather than switching to a panel that isn't there. */
  const openTab = useCallback(
    (next: RailTab) => {
      if (isWindow(next)) {
        if (windows.includes(next)) openWindow(next);
        return;
      }
      if (!(tabs as string[]).includes(next)) return;
      select(next as Tab);
    },
    [select, openWindow, tabs, windows],
  );

  const canPost = canDo(group.permissions, "post", group.myRole);

  return (
    <>
      {/* The community's head across the full width, then the active panel beside the rail. Below lg the rail follows
          the panel: the content first, the context under it. */}
      <CommunityHeader group={group} windows={windows} pendingRequests={pendingRequests} onOpenWindow={openWindow} />

      <div className="lg:grid lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start lg:gap-6">
        <div className="min-w-0">
          <Tabs value={tab} onValueChange={select} items={tabItems}>
            {/* The strip scrolls sideways on a narrow screen rather than wrapping to two rows. */}
            {/* A lone tab is a label, not navigation: left out. */}
            {tabItems.length > 1 && <TabList aria-label="Community sections" />}

            {/* Each panel mounts fresh when its tab is chosen, so this fades the new one in. */}
            <TabPanels className={tabItems.length > 1 ? "mt-5" : ""}>
              <motion.div initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.2, ease: [0.2, 0, 0, 1] }}>
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
                    callableRace={callableRace}
                    composerOpen={composerOpen}
                    onComposerOpenChange={setComposerOpen}
                    focusPostId={focusPostId}
                    weekend={weekend}
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
              </motion.div>
            </TabPanels>
          </Tabs>
        </div>

        <aside className="mt-6 lg:sticky lg:top-20 lg:mt-0">
            <CommunityRightRail
              stats={stats}
              pulse={pulse}
              race={nextRace}
              predictions={railPredictions}
              leaderboard={leaderboard}
              members={group.members}
              myUserId={myUserId}
              crowdVsModel={crowdVsModel}
              showRace={isF1}
              showPredictions={modules.includes("predictions")}
              showLeaderboard={modules.includes("leaderboard")}
              canInvite={canInvite}
              onOpenTab={openTab}
            />
          </aside>
      </div>

      {/* Media, Members, About and Manage open over the page, so the feed underneath stays where it was. */}
      {shown && (
        <Dialog
          open={win !== null}
          onClose={closeWindow}
          title={shown === "manage" && !isAdmin ? "Join requests" : (shown === "members" || shown === "invite") && managesMembers(group) ? "Manage members" : WINDOW_TITLES[shown]}
          size={shown === "manage" || shown === "media" ? "xl" : "lg"}
          footer={
            askDiscard && shown === "manage" ? (
              <>
                <p className="mr-auto text-body-sm text-secondary">You have unsaved changes.</p>
                <Button variant="ghost" size="sm" onClick={() => setAskDiscard(false)}>
                  Keep editing
                </Button>
                <Button variant="danger" size="sm" onClick={closeWindow}>
                  Discard and close
                </Button>
              </>
            ) : undefined
          }
        >
          {shown === "media" && <MediaTab groupId={group.id} />}
          {/* Members and inviting are one window ("Manage members"); `invite` opens it on the Invite tab. */}
          {(shown === "members" || shown === "invite") && <GroupMembersTab key={shown} group={group} myUserId={myUserId} initialTab={shown === "invite" ? "invite" : "members"} />}
          {shown === "about" && <AboutTab group={group} modules={modules} memberCount={memberCount} />}
          {shown === "manage" && canManage && <ManageTabLazy group={group} pendingRequests={pendingRequests} onDirtyChange={(d) => (manageDirty.current = d)} />}
        </Dialog>
      )}

      {/* Fixed, bottom-right - the opposite corner from Ask Apex's own launcher, so the two can
          never collide. Only on the Feed tab, only for someone this community actually lets post, and
          only below lg: on a desktop the composer is inline above the feed, and a floating button sat
          over the rail. */}
      {tab === "feed" && canPost && (
        <span className="fixed bottom-5 right-5 z-30 rounded-card shadow-overlay lg:hidden">
          <Button variant="primary" size="lg" iconStart={Plus} onClick={() => setComposerOpen(true)}>
            Create post
          </Button>
        </span>
      )}
    </>
  );
}

/** Manage is the heaviest panel and the least-visited, so it's only imported when an admin (or moderator) actually
 * opens it rather than shipped in every member's bundle. */
function ManageTabLazy({ group, pendingRequests, onDirtyChange }: { group: GroupDetail; pendingRequests?: number; onDirtyChange: (dirty: boolean) => void }) {
  const [Loaded, setLoaded] = useState<React.ComponentType<{ group: GroupDetail; pendingRequests?: number; onDirtyChange?: (dirty: boolean) => void }> | null>(null);

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
  return <Loaded group={group} pendingRequests={pendingRequests} onDirtyChange={onDirtyChange} />;
}
