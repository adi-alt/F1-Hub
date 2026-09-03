"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { FeedPost } from "@/lib/supabase/groupPosts";
import type { GroupSummary } from "@/lib/supabase/groups";
import { FeedPostCard } from "./FeedPostCard";
import { FeedPostSkeleton } from "./FeedPostSkeleton";
import { PostComposer } from "./PostComposer";

/** The Groups home feed - server-rendered first page (`initialPosts`/`initialCursor`, so there's
 * real content on first paint, no client round trip for it), IntersectionObserver-driven infinite
 * scroll past that. Chronological across every group the user's joined ("Following") - no "For
 * You"/"Popular" tab, there's no real ranking signal yet to back one with (see listFeedPosts' own
 * comment); adding a tab that doesn't actually change anything would be exactly the fake
 * interaction this app avoids elsewhere. */
export function GroupsFeed({ groups, initialPosts, initialCursor }: { groups: GroupSummary[]; initialPosts: FeedPost[]; initialCursor: string | null }) {
  const [posts, setPosts] = useState(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  async function loadMore() {
    if (loadingMore || !cursor) return;
    setLoadingMore(true);
    setError(false);
    try {
      const res = await fetch(`/api/groups/feed?cursor=${encodeURIComponent(cursor)}`);
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
      { rootMargin: "400px" }, // fires well before the sentinel is actually on screen
    );
    observer.observe(el);
    return () => observer.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [cursor]);

  return (
    <div className="space-y-3">
      <PostComposer
        groups={groups}
        onPosted={() => {
          // Simplest correct refresh: re-fetch the first page rather than guessing where an
          // approval-pending post should slot in (it may not even be visible yet).
          fetch("/api/groups/feed")
            .then((r) => r.json())
            .then((body: { posts: FeedPost[]; nextCursor: string | null }) => {
              setPosts(body.posts);
              setCursor(body.nextCursor);
            })
            .catch(() => {});
        }}
      />

      {posts.length === 0 ? (
        <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-8 text-center">
          <p className="text-sm font-semibold text-neutral-300">Nothing here yet.</p>
          <p className="mt-1 text-sm text-neutral-500">Posts from groups you&apos;ve joined will show up here.</p>
        </div>
      ) : (
        <motion.div initial="hidden" animate="show" className="space-y-3">
          {posts.map((post, i) => (
            <FeedPostCard
              key={post.id}
              post={post}
              index={i}
              onVoted={(id, voted) => setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, hasVoted: voted, upvotes: p.upvotes + (voted ? 1 : -1) } : p)))}
              onCommentAdded={(id) => setPosts((prev) => prev.map((p) => (p.id === id ? { ...p, commentCount: p.commentCount + 1 } : p)))}
            />
          ))}
        </motion.div>
      )}

      {cursor && (
        <div ref={sentinelRef} className="py-2">
          {loadingMore && <FeedPostSkeleton />}
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
