"use client";

import { useEffect, useRef, useState } from "react";
import type { FeedPost, FeedType } from "@/lib/supabase/groupPosts";
import type { GroupSummary } from "@/lib/supabase/groups";
import { PostCard } from "./post/PostCard";
import { PostCardSkeleton } from "./post/PostCardSkeleton";
import { PostComposer } from "./PostComposer";

const TABS: { value: FeedType; label: string }[] = [
  { value: "following", label: "Following" },
  { value: "forYou", label: "For You" },
  { value: "latest", label: "Latest" },
];

/** The Groups home feed - server-rendered first page (`initialPosts`/`initialCursor`, so there's
 * real content on first paint), IntersectionObserver-driven infinite scroll past that. Three real
 * feed types, not decorative tabs (see listFeedPosts' own comment for exactly what each one
 * queries) - switching refetches from that feed's own first page, same as changing any other
 * filter. */
export function GroupsFeed({ groups, initialPosts, initialCursor }: { groups: GroupSummary[]; initialPosts: FeedPost[]; initialCursor: string | null }) {
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

  async function loadMore() {
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
  }

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !cursor) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) void loadMore();
      },
      { rootMargin: "400px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor, feedType]);

  function refreshCurrent() {
    fetch(`/api/groups/feed?feedType=${feedType}`)
      .then((r) => r.json())
      .then((body: { posts: FeedPost[]; nextCursor: string | null }) => {
        setPosts(body.posts);
        setCursor(body.nextCursor);
      })
      .catch(() => {});
  }

  return (
    <div className="space-y-3">
      <PostComposer groups={groups} onPosted={refreshCurrent} />

      <div className="flex items-center gap-1 border-b border-[var(--f1-line)]">
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

      {loading ? (
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <PostCardSkeleton key={i} />
          ))}
        </div>
      ) : posts.length === 0 ? (
        <div className="rounded-lg border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-8 text-center">
          <p className="text-sm font-semibold text-neutral-300">Nothing here yet.</p>
          <p className="mt-1 text-sm text-neutral-500">
            {feedType === "following" ? "Posts from groups you've joined will show up here." : "No posts to show right now."}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {posts.map((post, i) => (
            <PostCard key={post.id} post={post} index={i} showGroup />
          ))}
        </div>
      )}

      {cursor && (
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
