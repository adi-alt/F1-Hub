"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { postKindsFor, type CommunityFeatures, type PostKind } from "@/lib/communities";
import type { GroupPost } from "@/lib/supabase/groupPosts";
import type { GroupRole } from "@/lib/supabase/groups";
import { PostCard } from "../../components/post/PostCard";
import { PostCardSkeleton } from "../../components/post/PostCardSkeleton";
import { CreatePostModal, type DraftResult } from "../../components/post/CreatePostModal";

/** A post that exists on screen but not yet on the server. `pending` drives the "Sending..." state;
 * `failed` keeps it visible with a retry rather than silently dropping what the user wrote. */
type OptimisticPost = GroupPost & { pending?: boolean; failed?: boolean; draft?: Draft };
type Draft = { kind: PostKind; title: string | null; content: string; mediaUrl: string | null };

/**
 * One community's feed: cursor-paginated, optimistic on post, and non-destructive on failure.
 *
 * The three behaviours worth naming:
 *
 *  - A new post appears immediately as a pending card and is reconciled with the server's real row
 *    on success. On failure it stays put, marked, with Retry and Discard - the user's writing is
 *    never thrown away to keep a list tidy.
 *  - Pagination dedupes by id, so a post that shifted across a page boundary between requests can't
 *    render twice.
 *  - A moderated community's pending post says so on the card, because it genuinely won't be
 *    visible to anyone else yet and silently showing it as normal would be a lie.
 */
export function CommunityFeed({
  groupId,
  communityName,
  communityAvatarUrl,
  communityType,
  features,
  initialPosts,
  initialCursor,
  myRole,
  moderationEnabled,
}: {
  groupId: string;
  communityName: string;
  communityAvatarUrl: string | null;
  communityType: string;
  features: CommunityFeatures;
  initialPosts: GroupPost[];
  initialCursor: string | null;
  myRole: GroupRole;
  moderationEnabled: boolean;
}) {
  const [posts, setPosts] = useState<OptimisticPost[]>(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [composerOpen, setComposerOpen] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const canModerate = myRole === "admin" || myRole === "moderator";
  const kinds = postKindsFor(communityType, features);

  const loadMore = useCallback(async () => {
    if (loadingMore || !cursor) return;
    setLoadingMore(true);
    setPageError(false);
    try {
      const res = await fetch(`/api/groups/${groupId}/posts?cursor=${encodeURIComponent(cursor)}`);
      if (!res.ok) throw new Error("failed");
      const body = (await res.json()) as { posts: GroupPost[]; nextCursor: string | null };
      setPosts((prev) => {
        const seen = new Set(prev.map((p) => p.id));
        return [...prev, ...body.posts.filter((p) => !seen.has(p.id))];
      });
      setCursor(body.nextCursor);
    } catch {
      setPageError(true);
    } finally {
      setLoadingMore(false);
    }
  }, [cursor, groupId, loadingMore]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !cursor) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), { rootMargin: "400px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  async function send(draft: Draft, tempId: string): Promise<DraftResult> {
    const res = await fetch(`/api/groups/${groupId}/posts`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(draft),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { id?: string; status?: string; error?: string } | null;

    if (!res?.ok || !body?.id) {
      setPosts((prev) => prev.map((p) => (p.id === tempId ? { ...p, pending: false, failed: true, draft } : p)));
      return { ok: false, error: body?.error ?? "Couldn't post. Check your connection and try again." };
    }

    // Swap the temporary row for the real one, keeping its position rather than refetching the
    // whole feed and losing the reader's scroll.
    setPosts((prev) =>
      prev.map((p) => (p.id === tempId ? { ...p, id: body.id as string, status: (body.status as GroupPost["status"]) ?? "published", pending: false, failed: false, draft: undefined } : p)),
    );
    return { ok: true };
  }

  function submit(draft: Draft): Promise<DraftResult> {
    const tempId = `temp-${Date.now()}`;
    setPosts((prev) => [
      {
        id: tempId,
        groupId,
        userId: "",
        authorName: "You",
        authorRole: myRole,
        title: draft.title,
        content: draft.content,
        mediaUrl: draft.mediaUrl,
        kind: draft.kind,
        status: moderationEnabled && myRole === "member" ? "pending" : "published",
        createdAt: new Date().toISOString(),
        score: 0,
        myVote: 0,
        commentCount: 0,
        pending: true,
      },
      ...prev,
    ]);
    return send(draft, tempId);
  }

  function retry(post: OptimisticPost) {
    if (!post.draft) return;
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, pending: true, failed: false } : p)));
    void send(post.draft, post.id);
  }

  function refresh() {
    fetch(`/api/groups/${groupId}/posts`)
      .then((r) => r.json())
      .then((body: { posts: GroupPost[]; nextCursor: string | null }) => {
        setPosts(body.posts);
        setCursor(body.nextCursor);
      })
      .catch(() => {});
  }

  return (
    <div>
      {/* The composer is a prompt, not a live textarea - clicking opens the real thing. */}
      <button
        type="button"
        onClick={() => setComposerOpen(true)}
        className="flex w-full items-center gap-2.5 rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 px-3.5 py-3 text-left transition hover:border-white/20"
      >
        <EntityAvatar imageUrl={communityAvatarUrl} name={communityName} size={30} />
        <span className="text-sm text-neutral-500">Start a discussion...</span>
      </button>

      <div className="mt-3 space-y-3">
        {posts.map((post, i) =>
          post.failed ? (
            <FailedPost key={post.id} post={post} onRetry={() => retry(post)} onDiscard={() => setPosts((prev) => prev.filter((p) => p.id !== post.id))} />
          ) : (
            <div key={post.id} className={post.pending ? "opacity-60" : ""}>
              <PostCard post={post} index={i} showGroup={false} canModerate={canModerate} onModerated={refresh} />
              {post.pending && <p className="mt-1 pl-1 text-[11px] text-neutral-500">Sending…</p>}
            </div>
          ),
        )}

        {posts.length === 0 && (
          <div className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-10 text-center">
            <p className="text-sm font-semibold text-neutral-300">This community is quiet.</p>
            <p className="mt-1 text-xs text-neutral-500">Start the first conversation.</p>
            <button
              type="button"
              onClick={() => setComposerOpen(true)}
              className="mt-4 rounded-full bg-[var(--f1-red)] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
            >
              Start Discussion
            </button>
          </div>
        )}
      </div>

      {cursor && (
        <div ref={sentinelRef} className="pt-3">
          {loadingMore && <PostCardSkeleton />}
          {pageError && (
            <p className="py-2 text-center text-xs text-neutral-500">
              Couldn&apos;t load more discussions.{" "}
              <button type="button" onClick={() => void loadMore()} className="text-neutral-300 underline-offset-2 hover:text-white hover:underline">
                Retry
              </button>
            </p>
          )}
        </div>
      )}

      {!cursor && posts.length > 5 && <p className="pt-6 text-center text-xs text-neutral-600">You&apos;re all caught up.</p>}

      {composerOpen && (
        <CreatePostModal
          communityName={communityName}
          communityAvatarUrl={communityAvatarUrl}
          kinds={kinds}
          moderationNotice={moderationEnabled && myRole === "member"}
          onClose={() => setComposerOpen(false)}
          onSubmit={submit}
        />
      )}
    </div>
  );
}

/** A post the server rejected. Shows the text back to the user - the whole point is that their
 * writing survives the failure. */
function FailedPost({ post, onRetry, onDiscard }: { post: OptimisticPost; onRetry: () => void; onDiscard: () => void }) {
  return (
    <div className="rounded-lg border border-[var(--f1-red)]/40 bg-[var(--f1-red)]/[0.05] p-3.5">
      <p className="text-xs font-semibold text-[var(--f1-red)]">Couldn&apos;t post this.</p>
      {post.title && <p className="mt-1.5 text-sm font-semibold text-neutral-200">{post.title}</p>}
      <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-300">{post.content}</p>
      <div className="mt-2.5 flex items-center gap-3">
        <button type="button" onClick={onRetry} className="text-xs font-semibold text-white underline-offset-2 hover:underline">
          Retry
        </button>
        <button type="button" onClick={onDiscard} className="text-xs text-neutral-500 transition hover:text-neutral-300">
          Discard
        </button>
      </div>
    </div>
  );
}
