"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { EntityAvatar } from "@/components/EntityAvatar";
import { EmptyState, EmptyIcons } from "@/components/ui/EmptyState";
import { groupHref } from "@/lib/routes";
import type { FeedPost, FeedType, GroupPost } from "@/lib/supabase/groupPosts";
import type { GroupSummary } from "@/lib/supabase/groups";
import { PostCard } from "./post/PostCard";
import { PostCardSkeleton } from "./post/PostCardSkeleton";
import { PostComposer } from "./PostComposer";

const TABS: { value: FeedType; label: string }[] = [
  { value: "following", label: "Following" },
  { value: "forYou", label: "For You" },
  { value: "latest", label: "Latest" },
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
}: {
  groups: GroupSummary[];
  initialPosts: FeedPost[];
  initialCursor: string | null;
  selectedCommunity: GroupSummary | null;
}) {
  const communityId = selectedCommunity?.id ?? null;

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
    <div className="space-y-3">
      {/* Identity strip (community mode only) + composer + tabs (aggregate mode only), one shared
          surface - PostComposer's own border/background is switched off (`bare`) so this shell is
          the only outer surface any of them belong to. */}
      <div className="rounded-lg border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60">
        {selectedCommunity && (
          <div className="flex items-center gap-2 px-3.5 py-2.5">
            <EntityAvatar imageUrl={selectedCommunity.avatarUrl} name={selectedCommunity.name} size={22} />
            <p className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{selectedCommunity.name}</p>
            <Link href={groupHref(selectedCommunity.id)} className="shrink-0 text-xs font-medium text-neutral-500 transition hover:text-white">
              Open community →
            </Link>
          </div>
        )}
        <div className={selectedCommunity ? "border-t border-white/[0.06]" : ""}>
          <PostComposer
            key={communityId ?? "all"}
            groups={groups}
            onPosted={communityId ? refreshCommunity : refreshAggregate}
            bare
            fixedGroupId={communityId ?? undefined}
            placeholder={selectedCommunity ? `Post to ${selectedCommunity.name}...` : undefined}
          />
        </div>
        {!selectedCommunity && (
          <div className="flex items-center gap-1 border-t border-white/[0.06] px-1">
            {TABS.map((t) => (
              <button
                key={t.value}
                onClick={() => switchTab(t.value)}
                className={`relative px-3 py-2 text-xs font-semibold transition ${feedType === t.value ? "text-white" : "text-neutral-500 hover:text-neutral-300"}`}
              >
                {t.label}
                {feedType === t.value && <span className="absolute inset-x-2 -bottom-px h-0.5 rounded-full bg-[var(--f1-red)]" />}
              </button>
            ))}
          </div>
        )}
      </div>

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
            <div>
              {Array.from({ length: 3 }).map((_, i) => (
                <PostCardSkeleton key={i} />
              ))}
            </div>
          )
        ) : communityPosts.length === 0 ? (
          <EmptyState icon={EmptyIcons.post} title="Nothing has been posted here yet." description="Start the first conversation." />
        ) : (
          <div>
            {communityPosts.map((post, i) => (
              <PostCard key={post.id} post={post} index={i} showGroup={false} />
            ))}
          </div>
        )
      ) : loading ? (
        <div>
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
        <div>
          {posts.map((post, i) => (
            <PostCard key={post.id} post={post} index={i} showGroup />
          ))}
        </div>
      )}

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
    </div>
  );
}
