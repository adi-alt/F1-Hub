"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { EmptyState, EmptyIcons } from "@/components/ui/EmptyState";
import { canDo, permissionLevel, postKindsFor, type CommunityFeatures, type CommunityPermissions, type PostKind } from "@/lib/communities";
import type { GroupPost } from "@/lib/supabase/groupPosts";
import type { GroupRole } from "@/lib/supabase/groups";
import { PostCard } from "../../components/post/PostCard";
import { PostDetailWindow } from "../../components/post/PostDetailWindow";
import { useOptimisticVote } from "../../components/post/useOptimisticVote";
import { PostCardSkeleton } from "../../components/post/PostCardSkeleton";
import { PostComposer, type ComposerCommunity } from "../../components/PostComposer";
import type { RaceOption } from "../../components/post/PredictionComposer";
import { CreatePostModal, type DraftResult } from "../../components/post/CreatePostModal";
import { DEFAULT_FEED_QUERY, FeedControls, isFiltered, type FeedQuery } from "./FeedControls";

/** A post that exists on screen but not yet on the server. `pending` drives the "Sending..." state;
 * `failed` keeps it visible with a retry rather than silently dropping what the user wrote. */
type OptimisticPost = GroupPost & { pending?: boolean; failed?: boolean; draft?: Draft };
type Draft = { kind: PostKind; title: string | null; content: string; mediaUrl: string | null };

/** Turns the control row's state into the query string listPosts actually understands. Kept next to
 * the fetches so there is one definition of "what this feed is currently asking for". */
function queryString(q: FeedQuery, cursor?: string | null): string {
  const params = new URLSearchParams();
  if (q.sort !== "new") params.set("sort", q.sort);
  if (q.kind) params.set("kind", q.kind);
  if (q.query.trim()) params.set("q", q.query.trim());
  if (q.mediaOnly) params.set("mediaOnly", "1");
  if (q.mineOnly) params.set("mine", "1");
  if (q.pendingOnly) params.set("pending", "1");
  if (cursor) params.set("cursor", cursor);
  const s = params.toString();
  return s ? `?${s}` : "";
}

/**
 * One community's feed: composer, controls, and a cursor-paginated stream that is optimistic on
 * post and non-destructive on failure.
 *
 * The behaviours worth naming:
 *
 *  - A new post appears immediately as a pending card and is reconciled with the server's real row
 *    on success. On failure it stays put, marked, with Retry and Discard - the user's writing is
 *    never thrown away to keep a list tidy.
 *  - Pagination dedupes by id, so a post that shifted across a page boundary between requests can't
 *    render twice.
 *  - A moderated community's pending post says so on the card, because it genuinely won't be
 *    visible to anyone else yet and silently showing it as normal would be a lie.
 *  - Filtering and searching refetch from the server rather than filtering the page already loaded.
 *    A client-side filter would quietly search fifteen posts and call it "this community".
 *  - An optimistic post is only prepended when the current view would actually contain it. Posting
 *    a discussion while the Announcements chip is active must not make it appear under that chip.
 */
export function CommunityFeed({
  groupId,
  communityName,
  communityAvatarUrl,
  communityDescription,
  communityType,
  features,
  permissions,
  initialPosts,
  initialCursor,
  myRole,
  moderationEnabled,
  pendingCount,
  upcomingRaces,
  composerOpen,
  onComposerOpenChange,
  focusPostId,
}: {
  groupId: string;
  communityName: string;
  communityAvatarUrl: string | null;
  communityDescription: string | null;
  communityType: string;
  features: CommunityFeatures;
  permissions: CommunityPermissions;
  initialPosts: GroupPost[];
  initialCursor: string | null;
  myRole: GroupRole;
  moderationEnabled: boolean;
  /** Posts awaiting approval right now - only passed to someone who can act on them. */
  pendingCount?: number;
  /** This season's un-finished rounds, so a member who is allowed to open a prediction round can do
   * it from the composer. Empty for a community with no predictions module, which is exactly what
   * makes the composer not offer it. */
  upcomingRaces: RaceOption[];
  /** The full-post modal is controlled from the workspace, because the page's floating "Create
   * post" button lives out there (fixed to the viewport, outside this panel) and opens the same
   * one this feed's own empty state does. Controlled rather than signalled: two owners of one
   * boolean is a state machine, one owner and a setter is not. */
  composerOpen: boolean;
  onComposerOpenChange: (open: boolean) => void;
  /** A shared post permalink's `?post=` id, resolved by the server component. The post it names
   * may or may not be in this feed's first page, so it's fetched on demand - see PermalinkPost. */
  focusPostId: string | null;
}) {
  const [posts, setPosts] = useState<OptimisticPost[]>(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(false);
  const [query, setQuery] = useState<FeedQuery>(DEFAULT_FEED_QUERY);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  const canModerate = myRole === "admin" || myRole === "moderator";
  const kinds = postKindsFor(communityType, features, myRole);
  // Re-checked server-side in createPost regardless - this only decides whether to offer a composer
  // that would be refused, or to say plainly why there isn't one.
  const canPost = canDo(permissions, "post", myRole);
  const filtered = isFiltered(query);

  const community: ComposerCommunity = {
    id: groupId,
    name: communityName,
    description: communityDescription,
    avatarUrl: communityAvatarUrl,
    communityType,
    features,
    permissions,
    myRole,
  };

  // Every control-row change is a real refetch. The `initialPosts` the server rendered are the
  // default view's own first page, so the default state deliberately does NOT refetch on mount -
  // only an actual change away from it does.
  const firstRender = useRef(true);
  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false;
      return;
    }
    const controller = new AbortController();
    setReloading(true);
    setReloadError(false);
    fetch(`/api/groups/${groupId}/posts${queryString(query)}`, { signal: controller.signal })
      .then((res) => {
        if (!res.ok) throw new Error("failed");
        return res.json() as Promise<{ posts: GroupPost[]; nextCursor: string | null }>;
      })
      .then((body) => {
        setPosts(body.posts);
        setCursor(body.nextCursor);
        setPageError(false);
      })
      .catch(() => {
        if (!controller.signal.aborted) setReloadError(true);
      })
      .finally(() => {
        if (!controller.signal.aborted) setReloading(false);
      });
    return () => controller.abort();
  }, [groupId, query]);

  const loadMore = useCallback(async () => {
    if (loadingMore || !cursor) return;
    setLoadingMore(true);
    setPageError(false);
    try {
      const res = await fetch(`/api/groups/${groupId}/posts${queryString(query, cursor)}`);
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
  }, [cursor, groupId, loadingMore, query]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el || !cursor) return;
    const observer = new IntersectionObserver((entries) => entries[0]?.isIntersecting && void loadMore(), { rootMargin: "400px" });
    observer.observe(el);
    return () => observer.disconnect();
  }, [cursor, loadMore]);

  function refresh() {
    fetch(`/api/groups/${groupId}/posts${queryString(query)}`)
      .then((r) => r.json())
      .then((body: { posts: GroupPost[]; nextCursor: string | null }) => {
        setPosts(body.posts);
        setCursor(body.nextCursor);
      })
      .catch(() => {});
  }

  /** Whether a just-written post belongs in what's currently on screen. A discussion posted while
   * the Announcements chip is active is real and was saved - it just isn't in this view, so it is
   * not faked into it; the feed refetches instead and the post is where it actually is. */
  function matchesCurrentView(draft: Draft): boolean {
    if (query.pendingOnly && !(moderationEnabled && myRole === "member")) return false;
    if (query.mediaOnly && !draft.mediaUrl) return false;
    if (query.kind && query.kind !== draft.kind) return false;
    if (query.query.trim()) return false;
    // A ranked sort has no defined "top" position for a post with no votes yet.
    return query.sort === "new";
  }

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
    if (!matchesCurrentView(draft)) {
      return fetch(`/api/groups/${groupId}/posts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(draft),
      })
        .then(async (res) => {
          const body = (await res.json().catch(() => null)) as { id?: string; error?: string } | null;
          if (!res.ok || !body?.id) return { ok: false as const, error: body?.error ?? "Couldn't post. Check your connection and try again." };
          // Back to the plain latest view, where the new post genuinely is.
          setQuery({ ...DEFAULT_FEED_QUERY });
          return { ok: true as const };
        })
        .catch(() => ({ ok: false as const, error: "Couldn't post. Check your connection and try again." }));
    }

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
        // The optimistic row has no server metadata yet - it fills in on the refetch that
        // follows. Null is the honest placeholder; the attachment renders its typed card until
        // the real name and size arrive.
        attachment: null,
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

  return (
    <div>
      {canPost ? (
        // The full composer, not a prompt that has to be clicked before anything appears - the same
        // one the Communities home uses, pinned to this community so it can't post anywhere else.
        <PostComposer
          groups={[community]}
          fixedGroupId={groupId}
          placeholder={`Share your thoughts with ${communityName}...`}
          upcomingRaces={upcomingRaces}
          onPosted={refresh}
        />
      ) : (
        <p className="rounded-2xl border border-white/[0.07] bg-[var(--f1-carbon)]/60 px-4 py-3 text-xs text-neutral-500">
          {/* The real reason, from the community's own permission map - not a disabled box with no
              explanation. */}
          Posting in this community is limited to {permissionLevel(permissions, "post") === "admins" ? "admins" : "moderators and admins"}.
        </p>
      )}

      {moderationEnabled && myRole === "member" && (
        <p className="mt-2 px-1 text-[11px] text-neutral-500">Posts here are reviewed by a moderator before they appear to everyone.</p>
      )}

      <div className="mt-4">
        <FeedControls kinds={kinds} value={query} onChange={setQuery} canModerate={canModerate} moderationEnabled={moderationEnabled} pendingCount={canModerate ? pendingCount : undefined} />
      </div>

      <div className="mt-3 space-y-3">
        {reloading ? (
          Array.from({ length: 3 }).map((_, i) => <PostCardSkeleton key={i} />)
        ) : reloadError ? (
          <p className="py-6 text-center text-xs text-neutral-500">
            Couldn&apos;t load these posts.{" "}
            <button type="button" onClick={() => setQuery({ ...query })} className="text-neutral-300 underline-offset-2 hover:text-white hover:underline">
              Retry
            </button>
          </p>
        ) : (
          <>
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

            {posts.length === 0 &&
              // Two genuinely different empty states: a community with nothing in it at all, and a
              // filter that happens to match nothing. Telling someone to "start the first
              // conversation" because they searched for a word nobody has used would be wrong.
              (filtered ? (
                <EmptyState
                  icon={EmptyIcons.post}
                  title="Nothing matches these filters."
                  description={query.query.trim() ? `No posts here mention “${query.query.trim()}”.` : "Try a different filter."}
                  action={
                    <button
                      type="button"
                      onClick={() => setQuery({ ...DEFAULT_FEED_QUERY })}
                      className="rounded-full border border-[var(--f1-line)] px-4 py-1.5 text-xs font-semibold text-neutral-200 transition hover:border-white/30 hover:text-white"
                    >
                      Clear filters
                    </button>
                  }
                />
              ) : (
                <EmptyState
                  icon={EmptyIcons.post}
                  title="Nothing has been posted here yet."
                  description={canPost ? "Start the first conversation." : "Once someone posts, it shows up here."}
                  action={
                    canPost ? (
                      <button
                        type="button"
                        onClick={() => onComposerOpenChange(true)}
                        className="rounded-full bg-[var(--f1-red)] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110"
                      >
                        Start Discussion
                      </button>
                    ) : undefined
                  }
                />
              ))}
          </>
        )}
      </div>

      {cursor && !reloading && (
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

      {!cursor && !reloading && posts.length > 5 && <p className="pt-6 text-center text-xs text-neutral-600">You&apos;re all caught up.</p>}

      {focusPostId && <PermalinkPost key={focusPostId} postId={focusPostId} />}

      {composerOpen && (
        <CreatePostModal
          communityName={communityName}
          communityAvatarUrl={communityAvatarUrl}
          kinds={kinds}
          moderationNotice={moderationEnabled && myRole === "member"}
          onClose={() => onComposerOpenChange(false)}
          onSubmit={submit}
        />
      )}
    </div>
  );
}

/**
 * A post arrived at by permalink (`/groups/{id}?post={postId}`).
 *
 * Fetched rather than looked up in the loaded feed, because a shared link routinely points at
 * something older than the fifteen posts this page starts with - resolving it against what happens
 * to be loaded would open nothing for exactly the links most worth sharing. The endpoint enforces
 * membership itself, so a link into a community the reader isn't in is a 403 there, not a hole.
 *
 * Renders the post's own discussion window, which is what the link is for: someone shared a
 * conversation, not a position in a feed. Closing it clears `?post=` from the URL so a refresh
 * doesn't reopen it, and a post that can't be loaded says so once instead of failing silently.
 */
function PermalinkPost({ postId }: { postId: string }) {
  const [post, setPost] = useState<GroupPost | null>(null);
  const [error, setError] = useState("");
  const [dismissed, setDismissed] = useState(false);

  // No state reset here: this component is keyed by `postId` at the call site, so a different
  // permalink mounts a fresh one rather than reusing this one's state.
  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/posts/${postId}`, { signal: controller.signal })
      .then(async (res) => {
        const body = (await res.json().catch(() => null)) as (GroupPost & { error?: string }) | null;
        if (!res.ok) throw new Error(body?.error ?? "That post couldn't be opened.");
        return body as GroupPost;
      })
      .then(setPost)
      .catch((err: Error) => {
        if (!controller.signal.aborted) setError(err.message);
      });
    return () => controller.abort();
  }, [postId]);

  function close() {
    setDismissed(true);
    const url = new URL(window.location.href);
    url.searchParams.delete("post");
    window.history.replaceState(null, "", url);
  }

  if (dismissed) return null;

  if (error) {
    return (
      <div className="fixed bottom-5 right-5 z-[100] max-w-xs rounded-xl border border-[var(--f1-red)]/40 bg-zinc-900/95 p-3 shadow-lg backdrop-blur-md">
        <p className="text-xs text-[var(--f1-red)]">{error}</p>
        <button type="button" onClick={close} className="mt-1.5 text-[11px] font-medium text-neutral-400 transition hover:text-white">
          Dismiss
        </button>
      </div>
    );
  }

  if (!post) return null;

  return <PermalinkWindow post={post} onClose={close} />;
}

/** Split out purely so the vote hook can run unconditionally - it can't live behind the
 * `if (!post)` guard above. Voting here writes to the same endpoint the feed row does; the row
 * behind it reconciles on its own next load rather than sharing state across a fetch boundary. */
function PermalinkWindow({ post, onClose }: { post: GroupPost; onClose: () => void }) {
  const { score, myVote, vote } = useOptimisticVote(`/api/posts/${post.id}/vote`, post.score, post.myVote);
  const roleLabel = post.authorRole && post.authorRole !== "member" ? post.authorRole.toUpperCase() : undefined;

  return (
    <PostDetailWindow
      post={post}
      score={score}
      myVote={myVote}
      onVote={vote}
      roleLabel={roleLabel}
      pending={post.status === "pending"}
      focusCommentId={null}
      onClose={onClose}
    />
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
