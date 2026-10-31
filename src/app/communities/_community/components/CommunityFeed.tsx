"use client";

import { Button } from "@/components/ui/Button";
import { RetryLine } from "../../components/GroupsFeed";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CallableRace } from "@/lib/supabase/postCalls";
import { MessageSquare } from "lucide-react";
import { EmptyState } from "@/components/ui/EmptyState";
import { canDo, permissionLevel, postKindsFor, type CommunityFeatures, type CommunityPermissions, type PostKind } from "@/lib/communities";
import type { GroupPost } from "@/lib/supabase/groupPosts";
import type { GroupRole } from "@/lib/supabase/groups";
import { PostCard } from "../../components/post/PostCard";
import { PostDetailWindow } from "../../components/post/PostDetailWindow";
import { useOptimisticVote } from "../../components/post/useOptimisticVote";
import { useOptimisticSave } from "../../components/post/useOptimisticSave";
import { PostCardSkeleton } from "../../components/post/PostCardSkeleton";
import { PostComposer, type ComposerCommunity } from "../../components/PostComposer";
import type { RaceOption } from "../../components/post/PredictionComposer";
import { CreatePostModal } from "../../components/post/CreatePostModal";
import { DEFAULT_FEED_QUERY, FeedControls, isFiltered, type FeedQuery } from "./FeedControls";
import { GROUP_POSTS_CHANGED } from "@/components/GroupRealtimeWatcher";
import { WeekendBar } from "../../components/weekend/WeekendBar";
import { SessionResultCard } from "../../components/weekend/SessionResultCard";
import { useMinuteClock } from "@/hooks/useMinuteClock";
import { sessionEndsAt, sessionPhaseAt, type CommunitySession, type ResultLine, type SessionKey } from "@/lib/communityWeekend";
import type { CommunityWeekendData } from "@/lib/supabase/communityWeekend";

/** A post that exists on screen but not yet on the server. `pending` drives the "Sending..." state;
 * `failed` keeps it visible with a retry rather than silently dropping what the user wrote. */
type OptimisticPost = GroupPost & { pending?: boolean; failed?: boolean; draft?: Draft };
type Draft = { kind: PostKind; title: string | null; content: string; mediaUrl: string | null };
type DraftResult = { ok: true } | { ok: false; error: string };

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
  callableRace = null,
  composerOpen,
  onComposerOpenChange,
  focusPostId,
  focusCommentId,
  weekend = null,
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
  /** This weekend's race while calls on it are open (takes with receipts). */
  callableRace?: CallableRace | null;
  /** The full-post modal is controlled from the workspace, because the page's floating "Create
   * post" button lives out there (fixed to the viewport, outside this panel) and opens the same
   * one this feed's own empty state does. Controlled rather than signalled: two owners of one
   * boolean is a state machine, one owner and a setter is not. */
  composerOpen: boolean;
  onComposerOpenChange: (open: boolean) => void;
  /** A shared post permalink's `?post=` id, resolved by the server component. The post it names
   * may or may not be in this feed's first page, so it's fetched on demand - see PermalinkPost. */
  focusPostId: string | null;
  /** A shared comment permalink's `?comment=` id, resolved alongside its post. */
  focusCommentId: string | null;
  /** The race weekend this community is living in: the session bar above the feed, a session tag on each post, and
   * each session's result dropped into the stream where it ended. Null outside F1 communities. */
  weekend?: CommunityWeekendData;
}) {
  const [posts, setPosts] = useState<OptimisticPost[]>(initialPosts);
  const [cursor, setCursor] = useState(initialCursor);
  const [loadingMore, setLoadingMore] = useState(false);
  const [pageError, setPageError] = useState(false);
  const [query, setQuery] = useState<FeedQuery>(DEFAULT_FEED_QUERY);
  const [reloading, setReloading] = useState(false);
  const [reloadError, setReloadError] = useState(false);
  const sentinelRef = useRef<HTMLDivElement>(null);

  // Race-weekend mode, as on the Communities home: a session chosen on the bar narrows the feed to what was said
  // during and after it, with its result first. Results otherwise sit in the stream where their session ended, but
  // only in the plain newest-first view, where "where it ended" means something.
  const now = useMinuteClock();
  const [session, setSession] = useState<SessionKey | null>(null);
  const [selectedF1Tag, setSelectedF1Tag] = useState<string | null>(null);
  const sessions = weekend?.sessions ?? [];
  const tagFor = (post: GroupPost) => (sessions.length ? sessionPhaseAt(sessions, Date.parse(post.createdAt)) : null);
  const results: { session: CommunitySession; lines: ResultLine[]; at: number }[] = weekend
    ? sessions.filter((x) => weekend.results[x.key]?.length && sessionEndsAt(x) <= now).map((x) => ({ session: x, lines: weekend.results[x.key] as ResultLine[], at: sessionEndsAt(x) }))
    : [];

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

  // Realtime says the feed changed (GroupRealtimeWatcher): offer the new posts instead of moving what's being read.
  const [newPosts, setNewPosts] = useState(false);
  // Our own post comes back through realtime too; it is already on screen, so it isn't news.
  const postedAt = useRef(0);
  const topRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const onChange = (event: Event) => {
      if ((event as CustomEvent<{ groupId: string }>).detail?.groupId === groupId && Date.now() - postedAt.current > 5000) setNewPosts(true);
    };
    window.addEventListener(GROUP_POSTS_CHANGED, onChange);
    return () => window.removeEventListener(GROUP_POSTS_CHANGED, onChange);
  }, [groupId]);

  function showNewPosts() {
    setNewPosts(false);
    refresh();
    topRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function afterPost() {
    postedAt.current = Date.now();
    setNewPosts(false);
    refresh();
  }

  function refresh() {
    fetch(`/api/groups/${groupId}/posts${queryString(query)}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error(`feed ${r.status}`))))
      .then((body: { posts: GroupPost[]; nextCursor: string | null }) => {
        setPosts(body.posts);
        setCursor(body.nextCursor);
      })
      .catch(() => {});
  }

  /** Every post goes through /api/posts, the one creation path; groupId pins it to this community. */
  function createPostRequest(draft: Draft) {
    postedAt.current = Date.now();
    return fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...draft, groupId }),
    });
  }

  async function send(draft: Draft, tempId: string): Promise<DraftResult> {
    const res = await createPostRequest(draft).catch(() => null);
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

  function retry(post: OptimisticPost) {
    if (!post.draft) return;
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, pending: true, failed: false } : p)));
    void send(post.draft, post.id);
  }

  type StreamItem = { kind: "post"; post: OptimisticPost; at: number } | { kind: "result"; session: CommunitySession; lines: ResultLine[]; at: number };
  const plainView = !filtered;
  const stream: StreamItem[] = session
    ? [
        ...results.filter((r) => r.session.key === session).map((r) => ({ kind: "result" as const, ...r })),
        ...posts
          .filter((post) => {
            const tag = tagFor(post);
            return !!tag && tag.phase !== "build-up" && tag.key === session;
          })
          .map((post) => ({ kind: "post" as const, post, at: Date.parse(post.createdAt) })),
      ]
    : [
        ...posts.map((post) => ({ kind: "post" as const, post, at: Date.parse(post.createdAt) })),
        // Only results from within the loaded page's span, so a result never lands below posts that aren't loaded yet.
        ...(plainView ? results.filter((r) => !cursor || posts.length === 0 || r.at >= Date.parse(posts[posts.length - 1].createdAt)).map((r) => ({ kind: "result" as const, ...r })) : []),
      ].sort((a, b) => {
        if (!plainView) return 0;
        const aPinned = a.kind === "post" && a.post.pinned ? 1 : 0;
        const bPinned = b.kind === "post" && b.post.pinned ? 1 : 0;
        if (aPinned !== bPinned) return bPinned - aPinned;
        return b.at - a.at;
      });

  const visibleStream = selectedF1Tag
    ? stream.filter((item) => {
        if (item.kind !== "post") return false;
        return item.post.f1Tags?.some(
          (t) =>
            t.id.toLowerCase() === selectedF1Tag.toLowerCase() ||
            t.label.toLowerCase() === selectedF1Tag.toLowerCase(),
        );
      })
    : stream;

  return (
    <div>
      {weekend && (
        <div className="mb-3">
          <WeekendBar weekend={weekend} selected={session} onSelect={setSession} />
        </div>
      )}
      {canPost ? (
        // The full composer, not a prompt that has to be clicked before anything appears - the same
        // one the Communities home uses, pinned to this community so it can't post anywhere else.
        <PostComposer
          groups={[community]}
          fixedGroupId={groupId}
          placeholder={`Share your thoughts with ${communityName}...`}
          upcomingRaces={upcomingRaces}
          callableRace={callableRace}
          onPosted={afterPost}
        />
      ) : (
        <p className="rounded-lg border border-white/[0.06] bg-white/[0.012] px-4 py-3 text-body-sm text-tertiary">
          {/* The real reason, from the community's own permission map - not a disabled box with no
              explanation. */}
          Posting in this community is limited to {permissionLevel(permissions, "post") === "admins" ? "admins" : "moderators and admins"}.
        </p>
      )}

      {moderationEnabled && myRole === "member" && (
        <p className="mt-2 px-1 text-caption text-tertiary">Posts here are reviewed by a moderator before they appear to everyone.</p>
      )}

      <div className="mt-4">
        <FeedControls kinds={kinds} value={query} onChange={setQuery} canModerate={canModerate} moderationEnabled={moderationEnabled} pendingCount={canModerate ? pendingCount : undefined} />
      </div>

      <div ref={topRef} className="scroll-mt-24" />
      {newPosts && (
        <div className="sticky top-20 z-sticky mt-3 flex justify-center">
          <Button variant="secondary" size="sm" onClick={showNewPosts}>
            New posts
          </Button>
        </div>
      )}

      {selectedF1Tag && (
        <div className="mt-3 flex items-center justify-between rounded-control border border-brand/30 bg-brand/10 px-3 py-1.5 text-caption">
          <span className="flex items-center gap-1.5 text-primary">
            <span>Filtered by tag:</span>
            <span className="font-semibold text-brand">{selectedF1Tag}</span>
          </span>
          <button
            type="button"
            onClick={() => setSelectedF1Tag(null)}
            className="text-secondary hover:text-primary underline text-[11px]"
          >
            Clear tag filter
          </button>
        </div>
      )}

      {/* Posts as cards in the site's glass panel, 12px apart, as on the Communities home. */}
      <div className="mt-3 space-y-3">
        {reloading ? (
          Array.from({ length: 3 }).map((_, i) => <PostCardSkeleton key={i} />)
        ) : reloadError ? (
          <RetryLine message="Couldn't load these posts." onRetry={() => setQuery({ ...query })} />
        ) : (
          <>
            {visibleStream.map((item, i) =>
              item.kind === "result" ? (
                weekend && (
                  <SessionResultCard
                    key={`result:${item.session.key}`}
                    session={item.session}
                    lines={item.lines}
                    calledIt={weekend.calledIt[item.session.key]}
                    audience="here"
                    race={{ year: weekend.year, round: weekend.round, name: weekend.raceName }}
                  />
                )
              ) : item.post.failed ? (
                <FailedPost key={item.post.id} post={item.post} onRetry={() => retry(item.post)} onDiscard={() => setPosts((prev) => prev.filter((p) => p.id !== item.post.id))} />
              ) : (
                <div key={item.post.id} className={item.post.pending ? "opacity-60" : ""}>
                  <PostCard
                    post={item.post}
                    index={i}
                    showGroup={false}
                    canModerate={canModerate}
                    onModerated={refresh}
                    sessionTag={tagFor(item.post)}
                    onTagClick={setSelectedF1Tag}
                  />
                  {item.post.pending && <p className="mt-1 pl-1 text-caption text-tertiary">Sending…</p>}
                </div>
              ),
            )}

            {session && stream.length === 0 && (
              <EmptyState icon={MessageSquare} message={`Nothing was posted here during or after ${sessions.find((x) => x.key === session)?.label ?? "this session"} yet.`} />
            )}

            {!session && posts.length === 0 &&
              // Two genuinely different empty states: a community with nothing in it at all, and a
              // filter that happens to match nothing. Telling someone to "start the first
              // conversation" because they searched for a word nobody has used would be wrong.
              (filtered ? (
                <EmptyState
                  icon={MessageSquare}
                  message={query.query.trim() ? `No posts here mention “${query.query.trim()}”.` : "No posts here match these filters."}
                  action={
                    <button
                      type="button"
                      onClick={() => setQuery({ ...DEFAULT_FEED_QUERY })}
                      className="rounded-control border border-white/10 px-4 py-1.5 text-body-sm font-medium text-primary transition-colors duration-fast hover:border-white/30"
                    >
                      Clear filters
                    </button>
                  }
                />
              ) : (
                <EmptyState
                  icon={MessageSquare}
                  message={canPost ? "Nothing has been posted here yet: start the first conversation." : "Nothing has been posted here yet: once someone posts, it shows up here."}
                  action={
                    canPost ? (
                      <Button variant="primary" size="md" onClick={() => onComposerOpenChange(true)}>
                        Write a post
                      </Button>
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
            <RetryLine message="Couldn't load more." onRetry={() => void loadMore()} />
          )}
        </div>
      )}

      {!cursor && !reloading && posts.length > 5 && <p className="pt-6 text-center text-xs text-tertiary">You&apos;re all caught up.</p>}

      {focusPostId && <PermalinkPost key={`${focusPostId}:${focusCommentId ?? ""}`} postId={focusPostId} commentId={focusCommentId} />}

      {canPost && (
        <CreatePostModal
          open={composerOpen}
          community={community}
          upcomingRaces={upcomingRaces}
          callableRace={callableRace}
          moderationNotice={moderationEnabled && myRole === "member"}
          onClose={() => onComposerOpenChange(false)}
          onPosted={afterPost}
        />
      )}
    </div>
  );
}

/**
 * A post or comment arrived at by permalink (`/groups/{id}?post={postId}[&comment={commentId}]`).
 *
 * Fetched rather than looked up in the loaded feed, because a shared link routinely points at
 * something older than the fifteen posts this page starts with - resolving it against what happens
 * to be loaded would open nothing for exactly the links most worth sharing. The endpoint enforces
 * membership itself, so a link into a community the reader isn't in is a 403 there, not a hole.
 *
 * Renders the post's own discussion window, focused on the shared comment when one was supplied.
 * Closing it clears the discussion parameters from the URL so a refresh doesn't reopen it, and a
 * post that can't be loaded says so once instead of failing silently.
 */
function PermalinkPost({ postId, commentId }: { postId: string; commentId: string | null }) {
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
    url.searchParams.delete("comment");
    window.history.replaceState(null, "", url);
  }

  if (dismissed) return null;

  if (error) {
    return (
      // Top centre, clear of the mobile Create post button in the bottom corner.
      <div role="alert" className="fixed inset-x-4 top-20 z-[100] mx-auto flex max-w-sm items-center justify-between gap-3 rounded-card surface-glass p-3 shadow-overlay">
        <p className="text-body-sm text-primary">{error}</p>
        <button type="button" onClick={close} className="shrink-0 rounded-control px-2 py-1 text-body-sm font-medium text-secondary transition-colors duration-fast hover:text-primary focus-visible:outline-2 focus-visible:outline-focus-ring">
          Dismiss
        </button>
      </div>
    );
  }

  if (!post) return null;

  return <PermalinkWindow post={post} commentId={commentId} onClose={close} />;
}

/** Split out purely so the vote hook can run unconditionally - it can't live behind the
 * `if (!post)` guard above. Voting here writes to the same endpoint the feed row does; the row
 * behind it reconciles on its own next load rather than sharing state across a fetch boundary. */
function PermalinkWindow({ post, commentId, onClose }: { post: GroupPost; commentId: string | null; onClose: () => void }) {
  const { score, myVote, vote } = useOptimisticVote(`/api/posts/${post.id}/vote`, post.score, post.myVote);
  const { saved, saving, toggle } = useOptimisticSave(`/api/posts/${post.id}/save`, post.saved);
  const roleLabel = post.authorRole && post.authorRole !== "member" ? post.authorRole[0].toUpperCase() + post.authorRole.slice(1) : undefined;

  return (
    <PostDetailWindow
      post={post}
      score={score}
      myVote={myVote}
      onVote={vote}
      saved={saved}
      onSave={() => void toggle()}
      savePending={saving}
      roleLabel={roleLabel}
      pending={post.status === "pending"}
      commentsLocked={post.commentsLocked}
      focusCommentId={commentId}
      onClose={onClose}
    />
  );
}

/** A post the server rejected. Shows the text back to the user - the whole point is that their
 * writing survives the failure. */
function FailedPost({ post, onRetry, onDiscard }: { post: OptimisticPost; onRetry: () => void; onDiscard: () => void }) {
  return (
    <div className="rounded-lg border border-brand/40 bg-brand/5 p-3.5">
      <p className="text-xs font-semibold text-brand-text">Couldn&apos;t post this.</p>
      {post.title && <p className="mt-1.5 text-sm font-semibold text-neutral-200">{post.title}</p>}
      <p className="mt-1 whitespace-pre-wrap text-sm text-secondary">{post.content}</p>
      <div className="mt-2.5 flex items-center gap-3">
        <button type="button" onClick={onRetry} className="text-xs font-semibold text-white underline-offset-2 hover:underline">
          Retry
        </button>
        <button type="button" onClick={onDiscard} className="text-xs text-tertiary transition hover:text-secondary">
          Discard
        </button>
      </div>
    </div>
  );
}
