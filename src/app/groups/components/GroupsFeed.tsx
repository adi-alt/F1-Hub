"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { EmptyState, EmptyIcons } from "@/components/ui/EmptyState";
import { Tabs } from "@/components/ui/Tabs";
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

/** One row of the stream: a discussion or an open prediction round, ordered together by the time
 * each was actually created. Keeping them in one list (rather than a predictions strip above the
 * feed) is what makes a prediction read as something the community posted, which is what it is. */
type FeedItem = { key: string; at: number } & ({ kind: "post"; post: PostCardData } | { kind: "prediction"; prediction: FeedPrediction });

function interleave(posts: PostCardData[], predictions: FeedPrediction[]): FeedItem[] {
  const items: FeedItem[] = [
    ...posts.map((post) => ({ key: `post:${post.id}`, at: new Date(post.createdAt).getTime(), kind: "post" as const, post })),
    ...predictions.map((prediction) => ({ key: `prediction:${prediction.id}`, at: new Date(prediction.createdAt).getTime(), kind: "prediction" as const, prediction })),
  ];
  return items.sort((a, b) => b.at - a.at);
}

// The same segmented Tabs primitive Your F1's cockpit and the Apex Intelligence workspace already
// use (src/components/ui/Tabs.tsx) - a real sliding-capsule pill group with full APG tab semantics,
// not a hand-rolled row of underlined text buttons. Reusing it is the actual "use the existing F1
// HUB tab language" fix, not a second, visually-unrelated tab control that merely looks similar.
const TAB_ITEMS = [
  { key: "following", label: "Following" },
  { key: "forYou", label: "For You" },
  { key: "latest", label: "Latest" },
];

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
  driversByRace: Record<string, { code: string; name: string }[]>;
}) {
  const communityId = selectedCommunity?.id ?? null;
  const communityPredictions = communityId ? predictions.filter((p) => p.groupId === communityId) : predictions;

  // The composer only exists at the very top of the stream, so someone twenty posts down had no
  // way to start one without scrolling all the way back by hand. This watches whether it's still
  // on screen and, when it isn't, offers a real way back to it - the same composer, focused, not a
  // second one duplicated at the bottom.
  const composerRef = useRef<HTMLDivElement>(null);
  const [composerOffscreen, setComposerOffscreen] = useState(false);

  useEffect(() => {
    const el = composerRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(([entry]) => setComposerOffscreen(!entry.isIntersecting), { threshold: 0 });
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
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), { rootMargin: "400px" });
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
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMoreCommunity(), { rootMargin: "400px" });
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
    <div className="space-y-2.5">
      {selectedCommunity && (
        <div className="flex items-center gap-2.5 rounded-2xl border border-white/[0.07] bg-[var(--f1-carbon)]/60 px-4 py-3 backdrop-blur-sm">
          <EntityAvatar imageUrl={selectedCommunity.avatarUrl} name={selectedCommunity.name} seed={selectedCommunity.id} size={28} />
          <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">
            <span aria-hidden className="mr-1 font-mono text-xs font-normal text-neutral-500">
              C/
            </span>
            {selectedCommunity.name}
          </p>
          <Link href={groupHref(selectedCommunity.id)} className="flex shrink-0 items-center gap-1 whitespace-nowrap text-xs font-medium text-neutral-400 transition hover:text-white">
            Open community
            <svg viewBox="0 0 12 12" width="9" height="9" fill="none" aria-hidden>
              <path d="M4.5 2.5 8 6l-3.5 3.5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </Link>
        </div>
      )}

      <div ref={composerRef} data-tour="create-post">
        <PostComposer
          key={communityId ?? "all"}
          groups={groups}
          onPosted={communityId ? refreshCommunity : refreshAggregate}
          fixedGroupId={communityId ?? undefined}
          placeholder={selectedCommunity ? `Share something with ${selectedCommunity.name}...` : undefined}
          upcomingRaces={upcomingRaces}
        />
      </div>

      {!selectedCommunity && (
        <div className="flex items-center justify-between gap-3">
          <div data-tour="feed-tabs">
            <Tabs items={TAB_ITEMS} activeKey={feedType} onChange={(key) => switchTab(key as FeedType)} layoutId="groups-feed-tabs" panelId="groups-feed-panel" />
          </div>
          {/* Real, not decorative - "Following" is genuinely every community you've joined
              aggregated together (see listFeedPosts), so this is what the "All" view actually
              means. For You/Latest widen to public communities and personal posts too, which this
              line would misdescribe, so it only shows for Following. */}
          {feedType === "following" && groups.length > 0 && (
            <p className="hidden shrink-0 text-[11.5px] font-medium text-neutral-400 sm:block">
              {groups.length} {groups.length === 1 ? "community" : "communities"}
            </p>
          )}
        </div>
      )}

      {/* role="tabpanel" only applies to the aggregate mode - that's the only content the Tabs
          strip above actually controls; a selected community's own stream isn't one of its tabs. */}
      <div role={selectedCommunity ? undefined : "tabpanel"} id={selectedCommunity ? undefined : `groups-feed-panel-tab-${feedType}`}>
        {selectedCommunity ? (
          communityPosts === null ? (
            communityInitialError ? (
              <p className="py-6 text-center text-xs text-neutral-500">
                Couldn&apos;t load this community&apos;s feed.{" "}
                <button type="button" onClick={refreshCommunity} className="text-neutral-300 underline-offset-2 hover:text-white hover:underline">
                  Retry
                </button>
              </p>
            ) : (
              <div className="space-y-2.5">
                {Array.from({ length: 3 }).map((_, i) => (
                  <PostCardSkeleton key={i} />
                ))}
              </div>
            )
          ) : communityPosts.length === 0 ? (
            <EmptyState icon={EmptyIcons.post} title="Nothing has been posted here yet." description="Start the first conversation." />
          ) : (
            <div className="space-y-2.5">
              {interleave(communityPosts, communityPredictions).map((item, i) =>
                item.kind === "post" ? (
                  <PostCard key={item.key} post={item.post} index={i} showGroup={false} />
                ) : (
                  <PredictionFeedCard key={item.key} prediction={item.prediction} index={i} showGroup={false} drivers={driversByRace[item.prediction.raceId] ?? []} />
                ),
              )}
            </div>
          )
        ) : loading ? (
          <div className="space-y-2.5">
            {Array.from({ length: 3 }).map((_, i) => (
              <PostCardSkeleton key={i} />
            ))}
          </div>
        ) : posts.length === 0 ? (
          <EmptyState
            icon={EmptyIcons.post}
            title="Nothing here yet."
            description={feedType === "following" ? "Posts from communities you've joined will show up here." : "No posts to show right now."}
          />
        ) : (
          <div className="space-y-2.5">
            {interleave(posts, predictions).map((item, i) =>
              item.kind === "post" ? (
                <PostCard key={item.key} post={item.post} index={i} showGroup />
              ) : (
                <PredictionFeedCard key={item.key} prediction={item.prediction} index={i} showGroup drivers={driversByRace[item.prediction.raceId] ?? []} />
              ),
            )}
          </div>
        )}
      </div>

      {selectedCommunity
        ? communityCursor && (
            <div ref={communitySentinelRef} className="py-2">
              {communityLoadingMore && <PostCardSkeleton />}
              {communityMoreError && (
                <p className="text-center text-xs text-neutral-500">
                  Couldn&apos;t load more.{" "}
                  <button type="button" onClick={() => void loadMoreCommunity()} className="text-neutral-300 underline-offset-2 hover:text-white hover:underline">
                    Try again
                  </button>
                </p>
              )}
            </div>
          )
        : cursor && (
            <div ref={sentinelRef} className="py-2">
              {loadingMore && <PostCardSkeleton />}
              {error && (
                <p className="text-center text-xs text-neutral-500">
                  Couldn&apos;t load more.{" "}
                  <button type="button" onClick={() => void loadMore()} className="text-neutral-300 underline-offset-2 hover:text-white hover:underline">
                    Try again
                  </button>
                </p>
              )}
            </div>
          )}

      {/* Sticky rather than fixed: it belongs to the feed column and pins to the bottom of
          whichever scroll container that column actually is (its own at lg+, the document below
          that), so it can't drift over the rails or collide with Ask Apex's launcher at
          bottom-left. Only rendered while the composer is genuinely off screen. */}
      {composerOffscreen && (
        <div className="pointer-events-none sticky bottom-4 z-20 flex justify-center">
          <button
            type="button"
            onClick={jumpToComposer}
            className="pointer-events-auto flex items-center gap-1.5 whitespace-nowrap rounded-full border border-white/[0.12] bg-zinc-900/90 px-4 py-2 text-[13px] font-semibold text-white shadow-lg backdrop-blur-md transition hover:border-white/25 hover:bg-zinc-800/90 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
          >
            <svg viewBox="0 0 14 14" width="12" height="12" fill="none" aria-hidden>
              <path d="M7 2.5v9M2.5 7h9" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
            New post
          </button>
        </div>
      )}
    </div>
  );
}
