"use client";

import { RegionBoundary } from "@/components/ui/RegionBoundary";
import { Suspense, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence } from "motion/react";
import { ChevronRight, Compass, MessageSquare, Plus, Trophy, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { Skeleton } from "@/components/ui/Skeleton";
import { CreateCommunityModal } from "./create/CreateCommunityModal";
import type { FeedPost } from "@/lib/supabase/groupPosts";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import type { GroupSummary, PublicGroupSummary } from "@/lib/supabase/groups";
import { useRegisterApexScope } from "@/components/apex/ApexScopeProvider";
import { WeekendBar } from "./weekend/WeekendBar";
import type { ModelPick, SessionKey } from "@/lib/communityWeekend";
import type { CommunityWeekendData, CrowdVsModel } from "@/lib/supabase/communityWeekend";
import type { PredictionTrend, PredictionType } from "@/lib/groupPredictionTypes";
import type { CallableRace } from "@/lib/supabase/postCalls";
import { DiscoverSheet } from "./discover/DiscoverSheet";
import { GroupsFeed, type PredictionsBundle } from "./GroupsFeed";
import { GroupsLeftSidebar, MobileCommunitySelector } from "./GroupsLeftSidebar";
import { GroupsRightSidebar, type NextRace } from "./GroupsRightSidebar";
import { PANEL } from "./panel";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { formatCountdown, parseUtcDateTime } from "@/lib/countdown";
import { predictionStateAt } from "@/lib/groupPredictionTypes";
import { groupHref, raceHref } from "@/lib/routes";
import type { RaceOption } from "./post/PredictionComposer";
import type { CommunityPulseData } from "@/lib/supabase/communityPulse";
import { isPromiseLike, useProgressive, useStreamed, type Streamable } from "./useStreamed";

const EMPTY_PREDICTIONS: FeedPrediction[] = [];
const EMPTY_RACES: RaceOption[] = [];

/** The Communities home, an app shell: your communities on the left (with Pulse under them), the feed in the
 * middle, the race weekend on the right from xl. From lg only the feed scrolls; the rails fit the window and never
 * scroll or clip (scroll-views.md: no nested scroll views on the same axis). Someone in no community yet gets the
 * way in instead of an empty feed.
 *
 * Below lg it is one column in normal page scroll: a strip with the race and open rounds, a chip row to pick a
 * community, the feed, then the race-weekend widgets. */
export function GroupsHomeClient({
  groups,
  initialPosts = [],
  initialCursor = null,
  initialFeed,
  predictions = EMPTY_PREDICTIONS,
  predictionsBundle,
  nextRace = null,
  upcomingRaces = EMPTY_RACES,
  raceContext,
  pulse,
  driversByRace = {},
  modelByRace = {},
  initialTrends,
  weekend = null,
  crowdVsModel = null,
  callableRace = null,
  suggestions = [],
}: {
  groups: GroupSummary[];
  initialPosts?: FeedPost[];
  initialCursor?: string | null;
  initialFeed?: Streamable<{ posts: FeedPost[]; nextCursor: string | null }>;
  predictions?: FeedPrediction[];
  predictionsBundle?: Streamable<PredictionsBundle>;
  nextRace?: Streamable<NextRace>;
  upcomingRaces?: Streamable<RaceOption[]>;
  raceContext?: Streamable<{ nextRace: NextRace; upcomingRaces: RaceOption[] }>;
  pulse: Streamable<CommunityPulseData>;
  /** Driver roster per race id, for the open rounds shown in the feed. */
  driversByRace?: Record<string, { code: string; name: string; headshotUrl: string | null; team?: string }[]>;
  /** The Apex model's pick per race and round type (see getModelPicks). */
  modelByRace?: Record<string, Partial<Record<PredictionType, ModelPick>>>;
  /** Server-prefetched trends for the initial prediction rounds. */
  initialTrends?: Record<string, PredictionTrend>;
  /** The race weekend Communities is living in (see getCommunityWeekend): the bar above the feed, results in it. */
  weekend?: Streamable<CommunityWeekendData>;
  /** Your communities against the Apex model this season (see getCrowdVsModel). */
  crowdVsModel?: Streamable<CrowdVsModel | null>;
  /** This weekend's race while calls on it are open (see getCallableRace). */
  callableRace?: Streamable<CallableRace | null>;
  /** Public communities the viewer isn't in, for the rail's "Communities to join". */
  suggestions?: Streamable<PublicGroupSummary[]>;
}) {
  const [showDiscover, setShowDiscover] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  // The one piece of real interaction state this page adds: which community (if any) the left
  // rail has selected, which is what actually feeds the center column now - see GroupsFeed's own
  // comment. Lives here because both the rail (which row is active) and the feed (which stream to
  // fetch) need it.
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selectedCommunity = selectedId ? (groups.find((g) => g.id === selectedId) ?? null) : null;
  // A session chosen on the weekend bar narrows the feed to what was said during and after it.
  const [sessionFilter, setSessionFilter] = useState<SessionKey | null>(null);

  const nextRaceSource = useMemo<Streamable<NextRace>>(
    () => (raceContext ? (isPromiseLike(raceContext) ? raceContext.then((r) => r.nextRace) : raceContext.nextRace) : nextRace),
    [raceContext, nextRace],
  );
  const upcomingRacesSource = useMemo<Streamable<RaceOption[]>>(
    () => (raceContext ? (isPromiseLike(raceContext) ? raceContext.then((r) => r.upcomingRaces) : raceContext.upcomingRaces) : upcomingRaces),
    [raceContext, upcomingRaces],
  );
  const predictionsSource = useMemo<Streamable<FeedPrediction[]>>(
    () => (predictionsBundle ? (isPromiseLike(predictionsBundle) ? predictionsBundle.then((b) => b.predictions) : predictionsBundle.predictions) : predictions),
    [predictionsBundle, predictions],
  );

  // Picking another community swaps the feed, so bring its top into view: the feed column on a desktop, the page
  // on a phone. Not on first render.
  const feedRef = useRef<HTMLDivElement>(null);
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const feed = feedRef.current;
    if (feed && getComputedStyle(feed).overflowY !== "visible") feed.scrollTo({ top: 0 });
    else window.scrollTo({ top: 0 });
  }, [selectedId, sessionFilter]);

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

  const rightRail = (
    <RegionBoundary label="the race weekend">
      <GroupsRightSidebar predictions={predictionsSource} nextRace={nextRaceSource} suggestions={suggestions} onDiscover={() => setShowDiscover(true)} fixedHeight={groups.length > 0} crowdVsModel={crowdVsModel} />
    </RegionBoundary>
  );

  return (
    <div className={groups.length > 0 ? "py-4 lg:h-[calc(100dvh-3.5rem)]" : "py-6"}>
      {/* The page's name for screen readers and the outline; on screen the rails and the feed say what this is. */}
      <h1 className="sr-only">Communities</h1>

      {groups.length === 0 ? (
        // Nothing joined yet: no composer to post into nowhere and no empty feed, but the way in, beside the race
        // weekend.
        <div className="grid grid-cols-1 gap-6 xl:grid-cols-[minmax(0,1fr)_320px] xl:items-start">
          <GetStarted onDiscover={() => setShowDiscover(true)} onCreate={() => setShowCreate(true)} />
          <aside aria-label="Race weekend" className="min-w-0">
            {rightRail}
          </aside>
        </div>
      ) : (
        <div className="flex flex-col gap-6 lg:grid lg:h-full lg:grid-cols-[248px_minmax(0,1fr)] lg:grid-rows-[minmax(0,1fr)] lg:gap-5 xl:grid-cols-[248px_minmax(0,1fr)_320px]">
          {/* Bottom padding keeps the rail clear of the floating Apex launcher in the corner below it. */}
          <aside aria-label="Your communities" className="hidden min-h-0 pb-16 lg:block">
            <RegionBoundary label="your communities">
              <GroupsLeftSidebar groups={groups} selectedId={selectedId} onSelect={setSelectedId} onCreate={() => setShowCreate(true)} onDiscover={() => setShowDiscover(true)} pulse={pulse} />
            </RegionBoundary>
          </aside>

          {/* The one scrolling column from lg, vertical only: its 12px inner gutter holds the post rows' hover tone (they
              reach 12px past the text), so nothing spills sideways. A div, not a second <main>. */}
          <div ref={feedRef} data-feed-scroll className="min-w-0 lg:-mx-3 lg:min-h-0 lg:overflow-y-auto lg:overflow-x-hidden lg:overscroll-contain lg:px-3 lg:scrollbar-hide">
            <div className="space-y-3 lg:pb-8">
              <Suspense fallback={<WeekendBarSkeleton />}>
                <StreamedWeekendHeader
                  weekend={weekend}
                  nextRace={nextRaceSource}
                  predictions={predictionsSource}
                  selected={sessionFilter}
                  onSelect={setSessionFilter}
                />
              </Suspense>
              <MobileCommunitySelector groups={groups} selectedId={selectedId} onSelect={setSelectedId} onCreate={() => setShowCreate(true)} onDiscover={() => setShowDiscover(true)} />
              <RegionBoundary label="the feed">
              <GroupsFeed
                groups={groups}
                initialPosts={initialPosts}
                initialCursor={initialCursor}
                initialFeed={initialFeed}
                selectedCommunity={selectedCommunity}
                predictions={predictions}
                predictionsBundle={predictionsBundle}
                upcomingRaces={upcomingRacesSource}
                driversByRace={driversByRace}
                modelByRace={modelByRace}
                initialTrends={initialTrends}
                weekend={weekend}
                sessionFilter={sessionFilter}
                onClearSession={() => setSessionFilter(null)}
                callableRace={callableRace}
              />
              </RegionBoundary>
            </div>
          </div>

          {/* From xl a fixed-height column; at lg there's no room for it (the strip above the feed carries the race);
              below lg it follows the feed. */}
          <aside aria-label="Race weekend" className="min-w-0 lg:hidden xl:block xl:min-h-0">
            {rightRail}
          </aside>
        </div>
      )}

      <AnimatePresence>{showDiscover && <DiscoverSheet onClose={() => setShowDiscover(false)} />}</AnimatePresence>
      {showCreate && <CreateCommunityModal onClose={() => setShowCreate(false)} />}
    </div>
  );
}

/** The fallback above the feed when there's no race weekend to live in (the season is over, or its calendar can't be
 * read): the race and what's open to predict, below xl where the race rail isn't shown. */
function StreamedWeekendHeader({
  weekend,
  nextRace,
  predictions,
  selected,
  onSelect,
}: {
  weekend: Streamable<CommunityWeekendData>;
  nextRace: Streamable<NextRace>;
  predictions: Streamable<FeedPrediction[]>;
  selected: SessionKey | null;
  onSelect: (key: SessionKey | null) => void;
}) {
  const resolvedWeekend = useStreamed(weekend);
  const { data: resolvedPredictions } = useProgressive(predictions, EMPTY_PREDICTIONS);
  const { data: resolvedNextRace } = useProgressive<NextRace>(nextRace, null);
  const openRounds = resolvedPredictions.filter((p) => p.state === "open");

  if (resolvedWeekend) {
    return (
      <WeekendBar
        weekend={resolvedWeekend}
        selected={selected}
        onSelect={onSelect}
        openRounds={openRounds.length}
        roundsHref={openRounds[0] ? `${groupHref(openRounds[0].groupId)}&tab=predictions` : undefined}
      />
    );
  }
  return <WeekendStrip race={resolvedNextRace} predictions={resolvedPredictions} />;
}

export function WeekendBarSkeleton() {
  return (
    <div role="status" aria-label="Loading race weekend bar" className={`flex h-11 items-center justify-between gap-3 px-3.5 ${PANEL}`}>
      <Skeleton shape="block" className="h-3.5 w-40" />
      <div className="flex items-center gap-1.5">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} shape="block" className="h-6 w-10 rounded-full" />
        ))}
      </div>
    </div>
  );
}

function WeekendStrip({ race, predictions }: { race: NextRace; predictions: FeedPrediction[] }) {
  const now = useMinuteClock();
  const open = predictions.filter((p) => predictionStateAt(p.status, p.lockAt, now) === "open");
  if (!race && open.length === 0) return null;
  const raceAt = race?.raceDate ? parseUtcDateTime(race.raceDate).getTime() : null;
  const countdown = raceAt && raceAt > now ? formatCountdown(raceAt, now) : null;
  return (
    <div className="flex items-center gap-3 border-b border-white/[0.06] pb-3 xl:hidden">
      {race ? (
        <Link href={raceHref(race.year, race.round, race.name)} className="min-w-0 flex-1 rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
          <span className="block truncate text-body-sm font-semibold text-primary">
            {race.name}
          </span>
          <span suppressHydrationWarning className="block text-caption tabular text-secondary">
            {countdown ? `Lights out in ${countdown}` : race.raceDate ? "Race weekend underway" : `Round ${race.round}`}
          </span>
        </Link>
      ) : (
        <span className="min-w-0 flex-1 text-body-sm text-secondary">This weekend</span>
      )}
      {open.length > 0 && (
        <Button variant="ghost" size="sm" iconEnd={ChevronRight} asChild>
          <Link href={`${groupHref(open[0].groupId)}&tab=predictions`}>
            {open.length} open round{open.length === 1 ? "" : "s"}
          </Link>
        </Button>
      )}
    </div>
  );
}

/** For someone in no community yet: what communities are for, and the two ways in. */
function GetStarted({ onDiscover, onCreate }: { onDiscover: () => void; onCreate: () => void }) {
  const points = [
    { icon: Trophy, title: "Prediction rounds", text: "Pick the podium for each Grand Prix and climb your community's leaderboard." },
    { icon: MessageSquare, title: "Race-weekend talk", text: "Qualifying, strategy calls and the result, with people who follow the same team." },
    { icon: Users, title: "Your own league", text: "Start a private community for friends, with its own rounds and rules." },
  ];
  return (
    <section aria-labelledby="get-started" className="surface-glass overflow-hidden rounded-card border border-white/10">
      <div className="flex items-center gap-2 border-b border-white/10 px-4 py-2.5">
        <span aria-hidden className="flex gap-1.5">
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
          <span className="size-2.5 rounded-full bg-white/15" />
        </span>
        <span className="ml-1 text-caption text-secondary">Communities</span>
      </div>
      <div className="p-6 sm:p-8">
        <h2 id="get-started" className="text-title-lg text-primary">
          You&apos;re not in a community yet
        </h2>
        <p className="mt-2 max-w-xl text-body-sm text-secondary">Join one to see its conversation and prediction rounds here, or start your own.</p>
        <ul className="mt-6 grid gap-4 sm:grid-cols-3">
          {points.map((pt) => (
            <li key={pt.title} className="rounded-card bg-surface-2/60 p-4">
              <Icon icon={pt.icon} size={20} className="text-secondary" />
              <p className="mt-3 text-body-sm font-semibold text-primary">{pt.title}</p>
              <p className="mt-1 text-caption text-secondary">{pt.text}</p>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button variant="primary" size="md" iconStart={Compass} onClick={onDiscover}>
            Discover communities
          </Button>
          <Button variant="secondary" size="md" iconStart={Plus} onClick={onCreate}>
            Start your own
          </Button>
        </div>
      </div>
    </section>
  );
}
