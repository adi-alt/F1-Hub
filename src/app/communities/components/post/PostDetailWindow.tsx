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
import { useComments, type LocalComment } from "./useComments";
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
  roleLabel,
  pending,
  focusCommentId,
  onClose,
  onCountChange,
}: {
  post: PostCardData;
  score: number;
  myVote: VoteValue;
  onVote: (direction: 1 | -1) => void;
  roleLabel?: string;
  pending?: boolean;
  /** When set, only this comment's own sub-thread renders, with the same "this IS the conversation
   * view" framing - CommentTree flattens at its depth limit here rather than offering to open a
   * second window on top of this one. */
  focusCommentId: string | null;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}) {
  const { comments, tree, sort, setSort, add, discard, reload, error, loading } = useComments(post.id, onCountChange);
  const [visibleThreads, setVisibleThreads] = useState(THREADS_PER_PAGE);

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
    () => (focusCommentId ? ((comments ?? []).find((c) => c.id === focusCommentId) ?? null) : null),
    [comments, focusCommentId],
  );
  const allRoots = focused ? [focused] : tree.roots;
  const roots = allRoots.slice(0, visibleThreads);
  const remaining = allRoots.length - roots.length;
  const totalCount = comments?.length ?? 0;
  // The still to show beside the discussion: the image itself, or - for a document - the first
  // page rendered at upload. A file with neither gets a named chip below, not an empty slot.
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
          <CommentComposer
              variant="inline"
              draftKey={`comment:${post.id}:${focused?.id ?? "root"}`}
              onSubmit={(content) => add(content, focused ? focused.id : null)}
            placeholder={focused ? `Reply to ${focused.authorName}...` : "Write a comment..."}
          />
        </div>
      }
    >
      {/* The post, pinned above the scrolling discussion so it never leaves the screen. */}
      <div className="border-b border-subtle pb-3">
        <div className="flex items-start gap-2">
          {/* showGroup is always true here - the window is effectively the post's own page,
                where "which community" is always relevant, not something a surrounding page has
                already established. */}
          <PostHeader post={post} showGroup roleLabel={roleLabel} pending={pending} />
        </div>

        <div className="mt-2.5 flex items-start gap-3">
          <div className="min-w-0 flex-1">
            {post.title && <p className="text-sm font-semibold text-white">{post.title}</p>}
            <p className={`whitespace-pre-wrap break-words text-body-sm leading-relaxed text-secondary ${post.title ? "mt-1" : ""}`}>{post.content}</p>
          </div>
          {/* A thumbnail, not the full-bleed image: the discussion is what this panel is for,
                and the media is context for it. Non-image media (video/documents) has no useful
                still to show at this size, so it isn't faked with a generic tile. */}
          {thumbSrc && (
            // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-uploaded Storage URLs, not a known-domain asset next/image can optimize
            <img src={thumbSrc} alt="" className="h-16 w-20 shrink-0 rounded-lg border border-white/10 object-cover" />
          )}
        </div>

        {/* Its real name, never the storage UUID - the same rule the feed card follows. Only for
              files with no still of their own; anything with a preview is already shown above. */}
        {post.attachment && !thumbSrc && (
          <a
            href={post.attachment.url}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex max-w-full items-center gap-2 rounded-lg border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-caption text-secondary transition hover:border-white/[0.16] hover:text-white"
          >
            <span aria-hidden className="shrink-0 rounded bg-white/[0.07] px-1.5 py-0.5 text-caption font-bold tracking-wide text-secondary">
              {attachmentBadge(attachmentKind(post.attachment.mime, post.attachment.name ?? post.attachment.url), post.attachment.name)}
            </span>
            <span className="truncate">
              {displayName(post.attachment.name, attachmentKind(post.attachment.mime, post.attachment.name ?? post.attachment.url))}
            </span>
          </a>
        )}

        <div className="mt-2.5 flex items-center gap-2">
          <div className="rounded-full border border-white/10 bg-white/[0.03] px-1 py-0.5">
            <VoteControl score={score} myVote={myVote} onVote={onVote} compact />
          </div>
          <span className="flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-secondary">
            <svg viewBox="0 0 20 20" width="13" height="13" fill="none" aria-hidden>
              <path
                d="M3 4.5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8l-3.5 3v-3H3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z"
                stroke="currentColor"
                strokeWidth="1.4"
                strokeLinejoin="round"
              />
            </svg>
            <span className="tabular">{totalCount}</span>
          </span>
        </div>
      </div>

      <div className="pt-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-body-sm font-semibold text-white">
            {focused ? "This thread" : "Comments"}
            {!focused && totalCount > 0 && <span className="ml-1.5 text-xs font-normal tabular text-tertiary">{totalCount}</span>}
          </p>
          {!focused && totalCount > 1 && <CommentSortControl value={sort} onChange={setSort} />}
        </div>

        <div className="mt-2.5">
          {loading ? (
            <CommentsSkeleton count={3} />
          ) : error ? (
            <p className="py-2 text-xs text-tertiary">
              Couldn&apos;t load the discussion.{" "}
              <button type="button" onClick={reload} className="text-secondary underline-offset-2 hover:text-white hover:underline">
                Retry
              </button>
            </p>
          ) : allRoots.length === 0 ? (
            <div className="py-5 text-center">
              <p className="text-sm font-medium text-secondary">No comments yet</p>
              <p className="mt-1 text-xs text-tertiary">Be the first to reply.</p>
            </div>
          ) : (
            <>
              {/* No onOpenConversation: this IS the conversation view, so the tree flattens at
                    its depth limit rather than opening a second window over this one. */}
              <CommentTree
                roots={roots}
                childrenOf={tree.childrenOf}
                postId={post.id}
                onReply={add}
                onDiscard={discard}
                onShareComment={post.groupId ? shareComment : undefined}
              />
              {remaining > 0 && (
                <button
                  type="button"
                  onClick={() => setVisibleThreads((n) => n + THREADS_PER_PAGE)}
                  className="mt-3 w-full rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-xs font-medium text-secondary transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
                >
                  Load more comments
                </button>
              )}
            </>
          )}
        </div>
      </div>
    </Sheet>
  );
}
