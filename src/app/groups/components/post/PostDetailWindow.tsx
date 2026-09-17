"use client";

import { useMemo, useRef } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useModalFocusTrap } from "@/hooks/useModalFocusTrap";
import type { VoteValue } from "@/lib/supabase/groupPosts";
import { CommentComposer } from "./CommentComposer";
import { CommentsSkeleton } from "./CommentSkeleton";
import { CommentSortControl, CommentTree } from "./CommentTree";
import { PostContent } from "./PostContent";
import { PostHeader } from "./PostHeader";
import { PostMedia } from "./PostMedia";
import type { PostCardData } from "./types";
import { useComments, type LocalComment } from "./useComments";
import { VoteControl } from "./VoteControl";

/**
 * Opening a post's comments now opens THIS - the post itself as a floating window, comments
 * beneath it, instead of a small area expanding inline under the feed row (the previous behavior)
 * or a side-sliding panel (CommentDrawer, which this replaces along with the inline CommentThread -
 * neither is used anywhere else, so both are removed rather than left as dead code once this took
 * over their one real call site in PostCard).
 *
 * Same floating-window family as RaceQuickView - a centered panel on desktop, a bottom sheet on
 * phones, the identical border/backdrop/shadow/close-button/focus-trap/scroll-lock contract via
 * `useModalFocusTrap` - not a second, differently-shaped dialog for Communities alone.
 *
 * Vote state (`score`/`myVote`/`onVote`) is passed down from the SAME `useOptimisticVote` instance
 * PostCard's own feed row already owns, not a second copy - voting from inside this window and
 * voting from the row underneath it are the same action on the same state, so they can never drift
 * out of sync with each other.
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
  /** When set, the window shows only this comment's own sub-thread, with the same "this IS the
   * conversation view" framing CommentDrawer used - CommentTree renders flat at its depth limit
   * here rather than offering to escalate to a second window on top of this one. */
  focusCommentId: string | null;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}) {
  const { comments, tree, sort, setSort, add, discard, reload, error, loading } = useComments(post.id, onCountChange);
  const panelRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  useModalFocusTrap(panelRef, true, onClose);

  const focused = useMemo<LocalComment | null>(() => (focusCommentId ? ((comments ?? []).find((c) => c.id === focusCommentId) ?? null) : null), [comments, focusCommentId]);
  const roots = focused ? [focused] : tree.roots;
  const totalCount = comments?.length ?? 0;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={onClose}>
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Post"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 24, scale: 0.985 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 16, scale: 0.99 }}
        transition={{ duration: reduceMotion ? 0 : 0.22, ease: [0.22, 1, 0.36, 1] }}
        onClick={(e) => e.stopPropagation()}
        className="relative flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-900/70 shadow-2xl backdrop-blur-xl sm:max-h-[80vh] sm:w-[92vw] sm:max-w-xl sm:rounded-2xl"
      >
        {/* Phone-only drag affordance, same convention RaceQuickView's own sheet uses. */}
        <div aria-hidden className="flex shrink-0 justify-center pt-2.5 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-white/20" />
        </div>

        <header className="flex shrink-0 items-start justify-between gap-3 px-4 pb-3 pt-2.5 sm:px-5 sm:pt-4">
          {/* showGroup is always true here regardless of the feed this was opened from - the
              window is effectively the post's own page, where "which community" is always
              relevant context, not something the surrounding page already established. */}
          <PostHeader post={post} showGroup roleLabel={roleLabel} pending={pending} />
          <button
            type="button"
            onClick={onClose}
            aria-label="Close post"
            className="-mr-1 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-black/40 text-white/70 transition hover:bg-black/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
          >
            <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
              <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 pb-4 scrollbar-subtle sm:px-5">
          <PostContent title={post.title} content={post.content} />
          {post.mediaUrl && <PostMedia url={post.mediaUrl} />}

          <div className="mt-3 flex items-center gap-2">
            <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-0.5 py-0.5">
              <VoteControl score={score} myVote={myVote} onVote={onVote} compact />
            </div>
            <span className="rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-neutral-400">
              {totalCount} comment{totalCount === 1 ? "" : "s"}
            </span>
          </div>

          <div className="mt-4 border-t border-white/[0.07] pt-4">
            <div className="flex items-center justify-between">
              <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-neutral-600">{focused ? "This thread" : "Comments"}</p>
              {!focused && totalCount > 1 && <CommentSortControl value={sort} onChange={setSort} />}
            </div>

            <div className="mt-3">
              {loading ? (
                <CommentsSkeleton />
              ) : error ? (
                <p className="text-xs text-neutral-500">
                  Couldn&apos;t load the discussion.{" "}
                  <button type="button" onClick={reload} className="text-neutral-300 underline-offset-2 hover:text-white hover:underline">
                    Retry
                  </button>
                </p>
              ) : roots.length === 0 ? (
                <p className="text-xs text-neutral-600">No comments yet - be the first to reply.</p>
              ) : (
                // No onOpenConversation here: this IS the conversation view, so the tree keeps
                // rendering flat at its own depth limit rather than offering to open a second
                // window on top of this one.
                <CommentTree roots={roots} childrenOf={tree.childrenOf} postId={post.id} onReply={add} onDiscard={discard} />
              )}
            </div>
          </div>
        </div>

        <footer className="shrink-0 border-t border-white/10 px-4 py-3 sm:px-5">
          <CommentComposer onSubmit={(content) => add(content, focused ? focused.id : null)} placeholder={focused ? `Reply to ${focused.authorName}...` : "Write a reply..."} />
        </footer>
      </motion.div>
    </div>,
    document.body,
  );
}
