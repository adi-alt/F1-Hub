"use client";

import { useMemo, useState } from "react";
import { Sheet } from "@/components/ui/Dialog";
import { commentHref } from "@/lib/routes";
import { useRealtimeSubscription } from "@/hooks/useRealtimeSubscription";
import { postCommentListeners, postCommentsChannelKey } from "@/lib/realtime/channels";
import { attachmentBadge, attachmentKind, displayName } from "./attachmentMeta";
import { mediaKind } from "@/lib/mediaKind";
import type { VoteValue } from "@/lib/supabase/groupPosts";
import { CommentComposer } from "./CommentComposer";
import { CommentsSkeleton } from "./CommentSkeleton";
import { CommentSortControl, CommentTree } from "./CommentTree";
import { PostHeader } from "./PostHeader";
import type { PostCardData } from "./types";
import { filterCommentTree, useComments, type CommentFilter, type LocalComment } from "./useComments";
import { VoteControl } from "./VoteControl";

/** How many top-level threads render before "Load more comments". The endpoint returns a post's
 * comments in one response (there is no cursor on it), so this is a real cap on what's mounted at
 * once rather than a pretend page number - a 200-comment thread doesn't put 200 comment subtrees
 * in the DOM the moment the window opens. */
const THREADS_PER_PAGE = 8;

/**
 * Opening a post's comments opens this in the house Sheet (R-34): a bottom sheet on phones, a
 * right-hand panel from md up, with its focus trap, Escape and focus return.
 *
 * Vote state (`score`/`myVote`/`onVote`) comes from the SAME `useOptimisticVote` instance the feed
 * row behind it already owns, not a second copy - voting here and voting there are one action on
 * one piece of state, so they can't drift apart.
 */
export function PostDetailWindow({
  post,
  score,
  myVote,
  onVote,
  saved,
  onSave,
  savePending,
  roleLabel,
  pending,
  commentsLocked,
  focusCommentId,
  onClose,
  onCountChange,
}: {
  post: PostCardData;
  score: number;
  myVote: VoteValue;
  onVote: (direction: 1 | -1) => void;
  saved: boolean;
  onSave: () => void;
  savePending: boolean;
  roleLabel?: string;
  pending?: boolean;
  commentsLocked: boolean;
  /** When set, only this comment's own sub-thread renders initially, with a banner to expand all
   * comments on the post. */
  focusCommentId: string | null;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}) {
  const { comments, tree, sort, setSort, add, togglePin, toggleAccept, toggleReaction, discard, reload, error, loading } = useComments(post.id, onCountChange);
  const [visibleThreads, setVisibleThreads] = useState(THREADS_PER_PAGE);
  const [showAllComments, setShowAllComments] = useState(false);
  const [filter, setFilter] = useState<CommentFilter>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);

  const commentListeners = postCommentListeners(post.id);
  useRealtimeSubscription(postCommentsChannelKey(post.id), commentListeners, commentListeners[0], () => void reload(), reload);

  async function shareComment(commentId: string): Promise<boolean> {
    if (!post.groupId) return false;
    const url = `${window.location.origin}${commentHref(post.groupId, post.id, commentId)}`;
    try {
      await navigator.clipboard.writeText(url);
      return true;
    } catch {
      window.prompt("Copy this comment's link:", url);
      return false;
    }
  }

  const focused = useMemo<LocalComment | null>(
    () => (focusCommentId && !showAllComments ? ((comments ?? []).find((c) => c.id === focusCommentId) ?? null) : null),
    [comments, focusCommentId, showAllComments],
  );

  const filteredTree = useMemo(() => filterCommentTree(tree, searchQuery, filter), [tree, searchQuery, filter]);

  const hasOpComments = useMemo(() => (comments ?? []).some((c) => !c.deleted && c.isOp), [comments]);
  const hasMediaComments = useMemo(() => (comments ?? []).some((c) => !c.deleted && Boolean(c.mediaUrl)), [comments]);

  const allRoots = focused ? [focused] : filteredTree.roots;
  const activeChildrenOf = focused ? tree.childrenOf : filteredTree.childrenOf;
  const roots = allRoots.slice(0, visibleThreads);
  const remaining = allRoots.length - roots.length;
  const totalCount = comments?.length ?? 0;

  const isImage = post.attachment
    ? attachmentKind(post.attachment.mime, post.attachment.name ?? post.attachment.url) === "image"
    : post.mediaUrl
      ? mediaKind(post.mediaUrl) === "image"
      : false;
  const thumbSrc = post.attachment?.thumbUrl ?? (isImage ? post.mediaUrl : null);

  return (
    <Sheet
      open
      onClose={onClose}
      title="Discussion"
      size="lg"
      footer={
        <div className="w-full">
          {commentsLocked ? (
            <p className="rounded-control border border-white/10 bg-white/[0.03] px-3 py-2 text-center text-caption text-tertiary">Comments are locked on this post.</p>
          ) : (
            <CommentComposer
              variant="inline"
              draftKey={`comment:${post.id}:${focused?.id ?? "root"}`}
              onSubmit={(content, mediaUrl) => add(content, focused ? focused.id : null, mediaUrl)}
              placeholder={focused ? `Reply to ${focused.authorName}...` : "Write a comment..."}
            />
          )}
        </div>
      }
    >
      {/* The post, pinned above the scrolling discussion so it never leaves the screen. */}
      <div className="border-b border-subtle pb-3">
        <div className="flex items-start gap-2">
          <PostHeader post={post} showGroup roleLabel={roleLabel} pending={pending} />
        </div>

        <div className="mt-2.5 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {post.title && <p className="text-body-sm font-semibold text-primary">{post.title}</p>}
            <p className={`whitespace-pre-wrap break-words text-body-sm leading-relaxed text-secondary ${post.title ? "mt-1" : ""}`}>{post.content}</p>
          </div>
          {thumbSrc && (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-uploaded Storage URLs, not a known-domain asset next/image can optimize
            <img src={thumbSrc} alt="" className="h-16 w-20 shrink-0 rounded-card border border-white/10 object-cover" />
          )}
        </div>

        {post.attachment && !thumbSrc && (
          <a
            href={post.attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex max-w-full items-center gap-2 rounded-control border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-caption text-secondary transition-colors hover:border-white/[0.16] hover:text-primary"
          >
            <span aria-hidden className="shrink-0 rounded-control bg-white/[0.07] px-1.5 py-0.5 text-caption font-bold tracking-wide text-secondary">
              {attachmentBadge(attachmentKind(post.attachment.mime, post.attachment.name ?? post.attachment.url), post.attachment.name)}
            </span>
            <span className="truncate">
              {displayName(post.attachment.name, attachmentKind(post.attachment.mime, post.attachment.name ?? post.attachment.url))}
            </span>
          </a>
        )}

        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-1 py-0.5">
            <VoteControl score={score} myVote={myVote} onVote={onVote} compact />
          </div>
          <button
            type="button"
            onClick={onSave}
            disabled={savePending}
            aria-pressed={saved}
            className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-caption font-medium text-secondary transition-colors hover:bg-white/[0.06] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <span aria-hidden>{saved ? "★" : "☆"}</span>
            {saved ? "Saved" : "Save"}
          </button>
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-caption font-medium text-secondary">
            <svg viewBox="0 0 20 20" width="13" height="13" fill="none" aria-hidden>
              <path
                d="M3 4.5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8l-3.5 3v-3H3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
            <span className="tabular-nums">{totalCount}</span>
          </span>
        </div>
      </div>

      <div className="pt-3">
        {focused && (
          <div className="mb-3 flex items-center justify-between gap-2 rounded-card border border-brand/30 bg-brand/[0.06] px-3 py-2">
            <span className="text-caption text-secondary">Viewing single comment thread</span>
            <button
              type="button"
              onClick={() => setShowAllComments(true)}
              className="rounded-control text-caption font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              Show all {totalCount} comments
            </button>
          </div>
        )}

        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <p className="text-body-sm font-semibold text-primary">
              {focused ? "This thread" : "Comments"}
              {!focused && totalCount > 0 && <span className="ml-1.5 text-caption font-normal tabular-nums text-tertiary">{totalCount}</span>}
            </p>
            {!focused && (hasOpComments || hasMediaComments) && (
              <div className="flex items-center gap-1" role="group" aria-label="Filter comments">
                {(
                  [
                    { id: "all", label: "All", show: true },
                    { id: "op", label: "OP", show: hasOpComments },
                    { id: "media", label: "Media", show: hasMediaComments },
                  ] as const
                )
                  .filter((item) => item.show)
                  .map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      aria-pressed={filter === item.id}
                      onClick={() => setFilter(item.id)}
                      className={`rounded-full px-2 py-0.5 text-caption font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                        filter === item.id ? "bg-brand/20 text-brand-text" : "text-tertiary hover:text-secondary"
                      }`}
                    >
                      {item.label}
                    </button>
                  ))}
              </div>
            )}
          </div>

          {!focused && totalCount > 1 && (
            <div className="flex items-center gap-1.5">
              <CommentSortControl value={sort} onChange={setSort} />
              {totalCount >= 3 && (
                <button
                  type="button"
                  onClick={() => {
                    setSearchOpen((v) => {
                      if (v) setSearchQuery("");
                      return !v;
                    });
                  }}
                  aria-expanded={searchOpen}
                  aria-label="Search comments"
                  title="Search comments"
                  className={`flex size-7 items-center justify-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                    searchOpen || searchQuery ? "bg-white/[0.08] text-primary" : "text-tertiary hover:bg-white/[0.05] hover:text-secondary"
                  }`}
                >
                  <svg viewBox="0 0 16 16" width="13" height="13" fill="none" aria-hidden>
                    <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.4" />
                    <path d="m10.5 10.5 3 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
                  </svg>
                </button>
              )}
            </div>
          )}
        </div>

        {!focused && searchOpen && (
          <div className="mt-2 flex items-center gap-2">
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search comments or authors..."
              autoFocus
              className="w-full rounded-control border border-white/10 bg-surface-1 px-3 py-1.5 text-caption text-primary placeholder:text-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                className="shrink-0 rounded-control px-2 py-1 text-caption text-tertiary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                Clear
              </button>
            )}
          </div>
        )}

        <div className="mt-3">
          {loading ? (
            <CommentsSkeleton count={3} />
          ) : error ? (
            <p className="py-2 text-caption text-tertiary">
              Couldn&apos;t load the discussion.{" "}
              <button
                type="button"
                onClick={() => void reload()}
                className="rounded-control text-secondary underline-offset-2 hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                Retry
              </button>
            </p>
          ) : allRoots.length === 0 ? (
            <div className="py-5 text-center">
              <p className="text-body-sm font-medium text-secondary">
                {searchQuery || filter !== "all" ? "No matching comments" : "No comments yet"}
              </p>
              <p className="mt-1 text-caption text-tertiary">
                {searchQuery || filter !== "all" ? "Try clearing your search or filter." : "Be the first to reply."}
              </p>
            </div>
          ) : (
            <>
              <CommentTree
                roots={roots}
                childrenOf={activeChildrenOf}
                postId={post.id}
                onReply={add}
                onDiscard={discard}
                onTogglePin={togglePin}
                onToggleAccept={toggleAccept}
                onToggleReaction={toggleReaction}
                commentsLocked={commentsLocked}
                highlightedCommentId={focusCommentId}
                onShareComment={post.groupId ? shareComment : undefined}
              />
              {remaining > 0 && (
                <button
                  type="button"
                  onClick={() => setVisibleThreads((n) => n + THREADS_PER_PAGE)}
                  className="mt-3 w-full rounded-card border border-white/10 bg-white/[0.02] px-3 py-2 text-caption font-medium text-secondary transition-colors hover:border-white/20 hover:bg-white/[0.05] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  Load more comments ({remaining} remaining)
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}
