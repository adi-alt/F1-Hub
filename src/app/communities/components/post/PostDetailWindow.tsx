"use client";

import { useMemo, useState } from "react";
import { Bookmark, MessageSquare, Search, X } from "lucide-react";
import { Sheet } from "@/components/ui/Dialog";
import { Icon } from "@/components/ui/Icon";
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
  onAnsweredChange,
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
  onAnsweredChange?: (answered: boolean) => void;
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
      <div className="border-b border-subtle pb-3.5">
        <div className="flex items-start gap-2">
          <PostHeader post={post} showGroup roleLabel={roleLabel} pending={pending} />
        </div>

        <div className="mt-2.5 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {post.title && <p className="text-body-sm font-semibold text-primary">{post.title}</p>}
            <p className={`whitespace-pre-wrap break-words text-body-sm leading-6 text-primary/85 ${post.title ? "mt-1" : ""}`}>{post.content}</p>
          </div>
          {thumbSrc && (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-uploaded Storage URLs, not a known-domain asset next/image can optimize
            <img src={thumbSrc} alt="" className="h-16 w-20 shrink-0 rounded-control border border-white/10 object-cover" />
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

        <div className="-ml-1.5 mt-2.5 flex flex-wrap items-center gap-1">
          <VoteControl score={score} myVote={myVote} onVote={onVote} compact />
          <button
            type="button"
            onClick={onSave}
            disabled={savePending}
            aria-pressed={saved}
            className={`flex h-7 items-center gap-1.5 rounded-control px-2.5 text-caption transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
              saved ? "bg-surface-2 font-medium text-primary" : "text-tertiary hover:bg-surface-2 hover:text-primary"
            }`}
          >
            <Bookmark size={14} fill={saved ? "currentColor" : "none"} />
            {saved ? "Saved" : "Save"}
          </button>
          <span className="flex h-7 items-center gap-1.5 rounded-control px-2.5 text-caption text-tertiary">
            <Icon icon={MessageSquare} size={16} className="size-3.5" />
            <span className="tabular-nums">{totalCount}</span>
          </span>
        </div>
      </div>

      <div className="pt-3.5">
        {focused && (
          <div className="mb-3.5 flex items-center justify-between gap-2 rounded-lg border border-brand/30 bg-brand/[0.06] px-3 py-2">
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

        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.06] pb-2.5">
          <div className="flex items-center gap-2">
            <p className="text-body-sm font-semibold text-primary">
              {focused ? "This thread" : "Comments"}
              {!focused && totalCount > 0 && (
                <span className="ml-1.5 rounded-control bg-white/[0.06] px-1.5 py-0.5 text-caption font-medium tabular-nums text-secondary">
                  {totalCount}
                </span>
              )}
            </p>
            {!focused && (hasOpComments || hasMediaComments) && (
              <div className="flex items-center gap-1" role="group" aria-label="Filter comments">
                {hasOpComments && (
                  <button
                    type="button"
                    aria-pressed={filter === "op"}
                    onClick={() => setFilter((prev) => (prev === "op" ? "all" : "op"))}
                    className={`rounded-control px-2 py-1 text-caption transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                      filter === "op" ? "bg-white/[0.08] font-medium text-primary" : "text-tertiary hover:bg-white/[0.04] hover:text-secondary"
                    }`}
                  >
                    OP replies
                  </button>
                )}
                {hasMediaComments && (
                  <button
                    type="button"
                    aria-pressed={filter === "media"}
                    onClick={() => setFilter((prev) => (prev === "media" ? "all" : "media"))}
                    className={`rounded-control px-2 py-1 text-caption transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                      filter === "media" ? "bg-white/[0.08] font-medium text-primary" : "text-tertiary hover:bg-white/[0.04] hover:text-secondary"
                    }`}
                  >
                    Media
                  </button>
                )}
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
                  className={`flex size-7 items-center justify-center rounded-control border transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                    searchOpen || searchQuery
                      ? "border-white/[0.16] bg-white/[0.08] text-primary"
                      : "border-white/[0.06] bg-white/[0.02] text-tertiary hover:border-white/[0.14] hover:text-secondary"
                  }`}
                >
                  <Icon icon={Search} size={16} className="size-3.5" />
                </button>
              )}
            </div>
          )}
        </div>

        {!focused && searchOpen && (
          <div className="mt-2.5 flex items-center gap-2 rounded-control border border-white/10 bg-surface-1 px-2.5 py-1.5">
            <Icon icon={Search} size={16} className="size-3.5 shrink-0 text-tertiary" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search comments or authors..."
              autoFocus
              className="w-full bg-transparent text-caption text-primary placeholder:text-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery("")}
                aria-label="Clear search"
                className="flex size-5 shrink-0 items-center justify-center rounded-control text-tertiary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <Icon icon={X} size={16} className="size-3.5" />
              </button>
            )}
          </div>
        )}

        <div className="mt-3.5">
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
            <div className="py-6 text-center">
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
                onToggleAccept={async (commentId, accepted) => {
                  onAnsweredChange?.(accepted);
                  await toggleAccept(commentId, accepted);
                }}
                onToggleReaction={toggleReaction}
                commentsLocked={commentsLocked}
                highlightedCommentId={focusCommentId}
                onShareComment={post.groupId ? shareComment : undefined}
              />
              {remaining > 0 && (
                <button
                  type="button"
                  onClick={() => setVisibleThreads((n) => n + THREADS_PER_PAGE)}
                  className="mt-3.5 w-full rounded-control border border-white/10 bg-white/[0.02] px-3 py-2 text-caption font-medium text-secondary transition-colors hover:border-white/20 hover:bg-white/[0.05] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
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
