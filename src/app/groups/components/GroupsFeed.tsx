"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AnimatePresence, motion } from "motion/react";
import { PANEL } from "./panel";
import { ChevronRight, MessageSquare, Plus } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { EntityAvatar } from "@/components/EntityAvatar";
import { EmptyState } from "@/components/ui/EmptyState";
import { TabList, TabPanels, Tabs, type TabItem } from "@/components/ui/Tabs";
import { groupHref } from "@/lib/routes";
import type { FeedPost, FeedType, GroupPost } from "@/lib/supabase/groupPosts";
import type { GroupSummary } from "@/lib/supabase/groups";
import { PostCard } from "./post/PostCard";
import { PostCardSkeleton } from "./post/PostCardSkeleton";
import { PredictionFeedCard } from "./post/PredictionFeedCard";
import { PostComposer } from "./PostComposer";
import type { FeedPrediction } from "@/lib/supabase/groupPredictions";
import type { RaceOption } from "./post/PredictionComposer";
import type { PostCardData } from "./post/types";
import { SessionResultCard } from "./weekend/SessionResultCard";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { liveSession, sessionEndsAt, sessionPhaseAt, type CommunitySession, type ModelPick, type ResultLine, type SessionKey } from "@/lib/communityWeekend";
import type { CommunityWeekendData } from "@/lib/supabase/communityWeekend";
import type { PredictionType } from "@/lib/groupPredictionTypes";
import type { CallableRace } from "@/lib/supabase/postCalls";

/** One row of the stream: a discussion, a prediction round, or a race-weekend session's result, ordered together by
 * when each happened (a result sits where its session ended). Keeping them in one list (rather than strips above the
 * feed) is what makes a round read as something the community posted, and a result as part of the conversation
 * around it. */
type FeedItem = { key: string; at: number } & (
  | { kind: "post"; post: PostCardData }
  | { kind: "prediction"; prediction: FeedPrediction }
  | { kind: "result"; session: CommunitySession; lines: ResultLine[] }
);

type ResultItem = Extract<FeedItem, { kind: "result" }>;

function interleave(posts: PostCardData[], predictions: FeedPrediction[], results: ResultItem[] = []): FeedItem[] {
  const items: FeedItem[] = [
    ...posts.map((post) => ({ key: `post:${post.id}`, at: new Date(post.createdAt).getTime(), kind: "post" as const, post })),
    ...predictions.map((prediction) => ({ key: `prediction:${prediction.id}`, at: new Date(prediction.createdAt).getTime(), kind: "prediction" as const, prediction })),
    ...results,
  ];
  return items.sort((a, b) => b.at - a.at);
}

/** The session a round is about: pole is settled by qualifying; every other round by the race. */
const sessionOfRound = (p: FeedPrediction): SessionKey => (p.type === "pole" ? "Q" : "R");

/** The feed is a stack of cards in the site's glass panel (posts and prediction rounds alike), 12px apart, as Season
 * stacks its sections. */
const FEED_LIST = "space-y-3";

/** How an item that arrives in a feed already on screen (your new post, the next page) enters: it drops in and
 * settles. `initial={false}` on the AnimatePresence above it keeps the first render still. */
const ARRIVE = {
  initial: { opacity: 0, y: -10 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0 },
  transition: { type: "spring" as const, stiffness: 380, damping: 32 },
};

// Underline tabs: which feed the centre column shows is that column's main switch, not a small
// in-card filter.
const TAB_ITEMS: TabItem<FeedType>[] = [
  { value: "following", label: "Following" },
  { value: "forYou", label: "For You" },
  { value: "latest", label: "Latest" },
];

/** The element the feed scrolls in: its own column on a desktop (data-feed-scroll, overflow-y auto), or null for the
 * page itself on a phone, where that column doesn't scroll. */
function scrollRootOf(el: Element): Element | null {
  const root = el.closest("[data-feed-scroll]");
  return root && getComputedStyle(root).overflowY !== "visible" ? root : null;
}

/**
 * The center stream. Two real modes, not a client-side filter of one:
 *
 *  - no community selected ("All" in the left rail) - the existing cross-community
 *    Following/For You/Latest feed, unchanged from before this pass.
 *  - a community selected - that community's own real stream, fetched from the exact same
 *    `/api/groups/{id}/posts` endpoint the community's own page uses (`listPosts`, requireMember-
 *    gated). A client-side filter of whatever the aggregate feed happened to have already loaded
 *    would silently miss that community's own older posts; this is a second, real, independently-
 *    paginated fetch instead - selecting a community is genuine navigation-in-place, not a lens
 *    over the same three loaded pages.
 *
 * Composer, identity strip and tabs live inside one shared surface (see the wrapping div below) -
 * one continuous system, not the same three elements each in their own bordered box.
 */
export function GroupsFeed({
  groups,
  initialPosts,
  initialCursor,
  selectedCommunity,
  predictions,
  upcomingRaces,
  driversByRace,
  modelByRace = {},
  weekend = null,
  sessionFilter = null,
  onClearSession,
  callableRace = null,
}: {
  groups: GroupSummary[];
  initialPosts: FeedPost[];
  initialCursor: string | null;
  selectedCommunity: GroupSummary | null;
  /** The viewer's real open prediction rounds - the SAME array the context rail renders, fetched
   * once by the page, not a second query. Interleaved into the stream below by their own
   * createdAt so a round shows up where it actually happened rather than pinned to the top. */
  predictions: FeedPrediction[];
  /** This season's un-finished rounds, for opening a prediction from the composer. */
  upcomingRaces: RaceOption[];
  /** Driver roster per race id, so a round can be entered from the feed itself. */
  driversByRace: Record<string, { code: string; name: string; headshotUrl: string | null; team?: string }[]>;
  /** The Apex model's pick per race and round type, for the cards' crowd-vs-Apex line. */
  modelByRace?: Record<string, Partial<Record<PredictionType, ModelPick>>>;
  /** The race weekend Communities is living in: tags posts with their session, drops each session's result in. */
  weekend?: CommunityWeekendData;
  /** A session chosen on the weekend bar: the feed narrows to what was said during and after it. */
  sessionFilter?: SessionKey | null;
  onClearSession?: () => void;
  /** This weekend's race while calls are open (takes with receipts), for the composer. */
  callableRace?: CallableRace | null;
}) {
  const communityId = selectedCommunity?.id ?? null;
  // Each community's picture, for the prediction cards (a round carries its community's name, not its picture).
  const avatarById = new Map(groups.map((g) => [g.id, g.avatarUrl]));
  const communityPredictions = communityId ? predictions.filter((p) => p.groupId === communityId) : predictions;

  // Race-weekend mode. A minute clock keeps the composer's prompt and the live tags current.
  const now = useMinuteClock();
  const sessions = weekend?.sessions ?? [];
  const live = liveSession(sessions, now);
  const results: ResultItem[] = weekend
    ? sessions
        .filter((s) => weekend.results[s.key]?.length)
        .map((s) => ({ key: `result:${weekend.round}:${s.key}`, at: sessionEndsAt(s), kind: "result" as const, session: s, lines: weekend.results[s.key] as ResultLine[] }))
    : [];
  const tagFor = (post: PostCardData) => (sessions.length ? sessionPhaseAt(sessions, Date.parse(post.createdAt)) : null);
  const inFilter = (item: FeedItem) => {
    if (!sessionFilter) return true;
    if (item.kind === "result") return item.session.key === sessionFilter;
    if (item.kind === "prediction") return item.prediction.raceId === weekend?.raceId && sessionOfRound(item.prediction) === sessionFilter;
    const tag = tagFor(item.post);
    return !!tag && tag.phase !== "build-up" && tag.key === sessionFilter;
  };
  const filterLabel = sessions.find((s) => s.key === sessionFilter)?.label;

  const renderItem = (item: FeedItem, i: number, showGroup: boolean) =>
    item.kind === "post" ? (
      <PostCard post={item.post} index={i} showGroup={showGroup} sessionTag={tagFor(item.post)} />
    ) : item.kind === "result" ? (
      weekend && <SessionResultCard session={item.session} lines={item.lines} calledIt={weekend.calledIt[item.session.key]} race={{ year: weekend.year, round: weekend.round, name: weekend.raceName }} />
    ) : (
      <PredictionFeedCard
        prediction={item.prediction}
        index={i}
        showGroup={showGroup}
        drivers={driversByRace[item.prediction.raceId] ?? []}
        modelPick={modelByRace[item.prediction.raceId]?.[item.prediction.type] ?? null}
        groupAvatarUrl={avatarById.get(item.prediction.groupId) ?? null}
      />
    );

  /** The stream itself: the items, newest first, narrowed to the chosen session if there is one. */
  const renderList = (items: FeedItem[], showGroup: boolean) => {
    const visible = items.filter(inFilter);
    if (sessionFilter && visible.length === 0) {
      return (
        <EmptyState
          boxed
          icon={MessageSquare}
          message={`Nothing was posted during or after ${filterLabel ?? "this session"} yet.`}
          action={
            onClearSession && (
              <Button variant="secondary" size="md" onClick={onClearSession}>
                Show everything
              </Button>
            )
          }
        />
      );
    }
    return (
      <div className={FEED_LIST}>
        <AnimatePresence initial={false}>
          {visible.map((item, i) => (
            <motion.div key={item.key} {...ARRIVE}>
              {renderItem(item, i, showGroup)}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
    );
  };

  // The composer only exists at the very top of the stream, so someone twenty posts down had no
  // way to start one without scrolling all the way back by hand. This watches whether it's still
  // on screen and, when it isn't, offers a real way back to it - the same composer, focused, not a
  // second one duplicated at the bottom.
  const composerRef = useRef<HTMLDivElement>(null);
  // Whether the feed tabs are pinned under the header: true once the line just above them has scrolled under it.
  const tabsSentinelRef = useRef<HTMLDivElement>(null);
  const [tabsStuck, setTabsStuck] = useState(false);
  useEffect(() => {
    const el = tabsSentinelRef.current;
    if (!el) return;
    // On a desktop the feed scrolls inside its own column (data-feed-scroll); on a phone, the page under the header.
    const root = scrollRootOf(el);
    const observer = new IntersectionObserver(([entry]) => setTabsStuck(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0) + 80), {
      root,
      rootMargin: root ? "0px" : "-57px 0px 0px 0px",
      threshold: 0,
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, [communityId]);
  const [composerOffscreen, setComposerOffscreen] = useState(false);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const root = scrollRootOf(el);
    const observer = new IntersectionObserver(([entry]) => setComposerOffscreen(!entry.isIntersecting && entry.boundingClientRect.top < (entry.rootBounds?.top ?? 0)), { root, threshold: 0 });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  function jumpToComposer() {
    const el = composerRef.current;
    if (!el) return;
    const reduceMotion = typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    el.scrollIntoView({ behavior: reduceMotion ? "auto" : "smooth", block: "start" });
    // preventScroll: the smooth scroll above owns the movement - letting focus() jump as well
    // lands hard on the element and cancels the animation it's meant to complement.
    el.querySelector("textarea")?.focus({ preventScroll: true });
  }

  // ---- Aggregate (cross-community) feed - identical behavior to before this pass ----
  const [feedType, setFeedType] = useState<FeedType>("following");
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  function switchTab(next: FeedType) {
    if (next === feedType) return;
    setFeedType(next);
    setLoading(true);
    setError(false);
    fetch(`/api/groups/feed?feedType=${next}`)
      .then((res) => res.json())
      .then((body: { posts: FeedPost[]; nextCursor: string | null }) => {
        setPosts(body.posts);
        setCursor(body.nextCursor);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }

  const loadMore = useCallback(async () => {
    if (loadingMore || !cursor) return;
    setLoadingMore(true);
    setError(false);
    try {
      const res = await fetch(`/api/groups/feed?feedType=${feedType}&cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error("failed");
      const body = (await res.json()) as { posts: FeedPost[]; nextCursor: string | null };
      setPosts((prev) => [...prev, ...body.posts]);
      setCursor(body.nextCursor);
    } catch {
      setError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, feedType, loadingMore]);

  useEffect(() => {
    if (communityId) return; // the community stream below owns the sentinel while one is selected
    const el = sentinelRef.current;
    if (!el || !cursor) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), { root: scrollRootOf(el), rootMargin: "400px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, loadMore, communityId]);

  function refreshAggregate() {
    fetch(`/api/groups/feed?feedType=${feedType}`)
      .then((r) => r.json())
      .then((body: { posts: FeedPost[]; nextCursor: string | null }) => {
        setPosts(body.posts);
        setCursor(body.nextCursor);
      })
      .catch(() => {});
  }

  // ---- One community's own stream ----
  const [communityPosts, setCommunityPosts] = useState<GroupPost[] | null>(null);
  const [communityCursor, setCommunityCursor] = useState<string | null>(null);
  const [communityInitialError, setCommunityInitialError] = useState(false);
  const [communityLoadingMore, setCommunityLoadingMore] = useState(false);
  const [communityMoreError, setCommunityMoreError] = useState(false);
  const communitySentinelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!communityId) return;
    let cancelled = false;
    // The reset (clearing the previous community's posts so its skeleton shows, not a flash of
    // stale content) is deferred a microtask rather than called synchronously at the top of the
    // effect body - the same reason DiscoverSheet's own filter-change effect defers its reset into
    // its debounce timeout instead of calling it directly inline.
    void Promise.resolve().then(() => {
      if (cancelled) return;
      setCommunityPosts(null);
      setCommunityInitialError(false);
      fetch(`/api/groups/${communityId}/posts`)
        .then((res) => {
          if (!res.ok) throw new Error("failed");
          return res.json() as Promise<{ posts: GroupPost[]; nextCursor: string | null }>;
        })
        .then((body) => {
          if (cancelled) return;
          setCommunityPosts(body.posts);
          setCommunityCursor(body.nextCursor);
        })
        .catch(() => !cancelled && setCommunityInitialError(true));
    });
    return () => {
      cancelled = true;
    };
  }, [communityId]);

  const loadMoreCommunity = useCallback(async () => {
    if (!communityId || communityLoadingMore || !communityCursor) return;
    setCommunityLoadingMore(true);
    setCommunityMoreError(false);
    try {
      const res = await fetch(`/api/groups/${communityId}/posts?cursor=${encodeURIComponent(communityCursor)}`);
      if (!res.ok) throw new Error("failed");
      const body = (await res.json()) as { posts: GroupPost[]; nextCursor: string | null };
      setCommunityPosts((prev) => [...(prev ?? []), ...body.posts]);
      setCommunityCursor(body.nextCursor);
    } catch {
      setCommunityMoreError(true);
    } finally {
      setCommunityLoadingMore(false);
    }
  }, [communityId, communityCursor, communityLoadingMore]);

  useEffect(() => {
    if (!communityId) return;
    const el = communitySentinelRef.current;
    if (!el || !communityCursor) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMoreCommunity(), { root: scrollRootOf(el), rootMargin: "400px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [communityId, communityCursor, loadMoreCommunity]);

  function refreshCommunity() {
    if (!communityId) return;
    fetch(`/api/groups/${communityId}/posts`)
      .then((r) => r.json())
      .then((body: { posts: GroupPost[]; nextCursor: string | null }) => {
        setCommunityPosts(body.posts);
        setCommunityCursor(body.nextCursor);
      })
      .catch(() => {});
  }

  return (
    <div className="space-y-3">
      {selectedCommunity && (
        <div className={`flex items-center gap-3 px-4 py-3 ${PANEL}`}>
          <EntityAvatar imageUrl={selectedCommunity.avatarUrl} name={selectedCommunity.name} seed={selectedCommunity.id} size={32} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-body-sm font-semibold text-primary">{selectedCommunity.name}</p>
            <p className="truncate text-caption text-secondary">
              {selectedCommunity.memberCount} member{selectedCommunity.memberCount === 1 ? "" : "s"}
              {selectedCommunity.activePredictions ? ` · ${selectedCommunity.activePredictions} open round${selectedCommunity.activePredictions === 1 ? "" : "s"}` : ""}
            </p>
          </div>
          <Button variant="secondary" size="sm" iconEnd={ChevronRight} asChild>
            <Link href={groupHref(selectedCommunity.id)}>Open</Link>
          </Button>
        </div>
      )}

      <div ref={composerRef} data-tour="create-post">
        <PostComposer
          key={communityId ?? "all"}
          groups={groups}
          onPosted={communityId ? refreshCommunity : refreshAggregate}
          fixedGroupId={communityId ?? undefined}
          placeholder={selectedCommunity ? `Share something with ${selectedCommunity.name}...` : live ? `${live.label} is live. What's happening?` : undefined}
          upcomingRaces={upcomingRaces}
          callableRace={callableRace}
        />
      </div>

      {selectedCommunity ? (
        <div>
          {communityPosts === null ? (
            communityInitialError ? (
              <p className="py-6 text-center text-caption text-secondary">
                Couldn&apos;t load this community&apos;s feed.{" "}
                <button type="button" onClick={refreshCommunity} className="text-secondary underline-offset-2 hover:text-white hover:underline">
                  Retry
                </button>
              </p>
            ) : (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <PostCardSkeleton key={i} />
                ))}
              </div>
            )
          ) : communityPosts.length === 0 ? (
            <EmptyState
              boxed
              icon={MessageSquare}
              message="Nothing has been posted here yet. Start the first conversation."
              action={
                <Button variant="secondary" size="md" iconStart={Plus} onClick={jumpToComposer}>
                  Write a post
                </Button>
              }
            />
          ) : (
            renderList(interleave(communityPosts, communityPredictions, results), false)
          )}
        </div>
      ) : (
        // Only the aggregate feed is a set of tabs; a selected community's own stream isn't one.
        <Tabs value={feedType} onValueChange={switchTab} items={TAB_ITEMS}>
          {/* Pinned under the site header while the feed scrolls, the way a social feed keeps its tabs in reach. It
              only gets a background (and a hairline) once it's actually pinned, so at rest it sits on the page. */}
          <div ref={tabsSentinelRef} aria-hidden className="h-px" />
          {/* Pinned, it wears the page's own background (page-backdrop: the canvas and its glow, anchored to the window),
              so it fully hides the posts scrolling under it yet doesn't read as a slab; a short fade under its edge lets
              them dissolve into it instead of being cut. Before, it was a translucent blur the text showed through. It
              spans the column's gutters so nothing peeks past its ends. */}
          <div
            className={`sticky top-14 z-20 -mx-4 -mt-px flex items-center justify-between gap-3 px-4 lg:top-0 lg:-mx-3 lg:px-3 ${
              tabsStuck
                ? "page-backdrop border-b border-white/[0.06] after:pointer-events-none after:absolute after:inset-x-0 after:top-full after:h-4 after:page-backdrop after:content-[''] after:[mask-image:linear-gradient(to_bottom,black,transparent)]"
                : "border-b border-transparent"
            }`}
          >
            <div data-tour="feed-tabs" className="min-w-0">
              <TabList aria-label="Feed" />
            </div>
            {/* Real, not decorative - "Following" is genuinely every community you've joined
                aggregated together (see listFeedPosts), so this is what the "All" view actually
                means. For You/Latest widen to public communities and personal posts too, which this
                line would misdescribe, so it only shows for Following. */}
            {feedType === "following" && groups.length > 0 && (
              <p className="hidden shrink-0 text-caption text-secondary sm:block">
                {groups.length} {groups.length === 1 ? "community" : "communities"}
              </p>
            )}
          </div>
          <TabPanels>
            {loading ? (
              <div className="space-y-3">
                {Array.from({ length: 3 }).map((_, i) => (
                  <PostCardSkeleton key={i} />
                ))}
              </div>
            ) : posts.length === 0 ? (
              <EmptyState
                boxed
                icon={MessageSquare}
                message={feedType === "following" ? "It's quiet in your communities. Start the conversation: the race weekend is a good place to begin." : "No posts to show right now."}
                action={
                  <Button variant="secondary" size="md" iconStart={Plus} onClick={jumpToComposer}>
                    Write a post
                  </Button>
                }
              />
            ) : (
              renderList(interleave(posts, predictions, results), true)
            )}
          </TabPanels>
        </Tabs>
      )}

      {selectedCommunity ? (
        communityCursor ? (
          <div ref={communitySentinelRef} className="py-2">
            {communityLoadingMore && <PostCardSkeleton />}
            {communityMoreError && (
              <p className="text-center text-caption text-secondary">
                Couldn&apos;t load more.{" "}
                <button type="button" onClick={() => void loadMoreCommunity()} className="text-secondary underline-offset-2 hover:text-white hover:underline">
                  Try again
                </button>
              </p>
            )}
          </div>
        ) : (
          (communityPosts?.length ?? 0) > 0 && <EndOfFeed />
        )
      ) : cursor ? (
        <div ref={sentinelRef} className="py-2">
          {loadingMore && <PostCardSkeleton />}
          {error && (
            <p className="text-center text-xs text-tertiary">
              Couldn&apos;t load more.{" "}
              <button type="button" onClick={() => void loadMore()} className="text-secondary underline-offset-2 hover:text-white hover:underline">
                Try again
              </button>
            </p>
          )}
        </div>
      ) : (
        !loading && posts.length > 0 && <EndOfFeed />
      )}

      {/* Sticky rather than fixed: it belongs to the feed column and pins to the bottom of
          whichever scroll container that column actually is (its own at lg+, the document below
          that), so it can't drift over the rails or collide with Ask Apex's launcher at
          bottom-left. Only rendered while the composer is genuinely off screen. */}
      {composerOffscreen && (
        <div className="pointer-events-none sticky bottom-4 z-20 flex justify-center">
          <span className="pointer-events-auto rounded-card shadow-overlay">
            <Button variant="secondary" size="md" iconStart={Plus} onClick={jumpToComposer}>
              New post
            </Button>
          </span>
        </div>
      )}
    </div>
  );
}

/**
 * The real end of what's loaded - shown once there's no more cursor to page through and at least
 * one post already rendered above it (an empty stream gets EmptyState instead, not this).
 *
 * The centre column is a fixed-height scroll region (it has to be - see GroupsHomeClient's own
 * comment on why all three tracks share one height, which is what lets each scroll independently),
 * so a short stream still sits inside a tall box and leaves real space below the last card. Without
 * this, that space was just silent - nothing said whether the stream had genuinely run out or was
 * quietly stuck, and the floating "New post" pill above it read as orphaned rather than as the
 * last thing in a finished list. This doesn't reclaim the space (nothing here safely can without
 * breaking that independent-scroll behavior for the much more common case of a stream that
 * actually overflows), it just says plainly that the list is finished.
 */
function EndOfFeed() {
  return (
    <motion.p
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.25 }}
      className="flex items-center justify-center gap-1.5 py-5 text-caption text-tertiary"
    >
      <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden>
        <path d="M3 8.5 6.2 11.5 13 4.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      You&apos;re all caught up
    </motion.p>
  );
}
