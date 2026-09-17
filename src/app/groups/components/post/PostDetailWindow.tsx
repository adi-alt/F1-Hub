"use client";

import { useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion, useReducedMotion } from "framer-motion";
import { useModalFocusTrap } from "@/hooks/useModalFocusTrap";
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
 * Opening a post's comments opens THIS - anchored bottom-right on desktop, a bottom sheet on
 * phones - not a centred, page-blocking dialog. It's meant to coexist with the feed behind it and
 * with Ask Apex's own launcher (bottom-left): no full-viewport backdrop, no scroll lock, so the
 * feed stays scrollable and clickable while this is open, the same non-blocking contract
 * ApexLauncher's own panel already follows. `useModalFocusTrap(..., { lockScroll: false })` still
 * gives it focus trap, focus restoration and Escape - just not the page-freeze a real modal needs
 * and this deliberately doesn't.
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
  const panelRef = useRef<HTMLDivElement>(null);
  const reduceMotion = useReducedMotion();
  const [visibleThreads, setVisibleThreads] = useState(THREADS_PER_PAGE);
  useModalFocusTrap(panelRef, true, onClose, { lockScroll: false });

  const focused = useMemo<LocalComment | null>(() => (focusCommentId ? ((comments ?? []).find((c) => c.id === focusCommentId) ?? null) : null), [comments, focusCommentId]);
  const allRoots = focused ? [focused] : tree.roots;
  const roots = allRoots.slice(0, visibleThreads);
  const remaining = allRoots.length - roots.length;
  const totalCount = comments?.length ?? 0;
  const isImage = post.mediaUrl ? mediaKind(post.mediaUrl) === "image" : false;

  return createPortal(
    // No backdrop element at all: on desktop this sits over nothing, so the feed underneath stays
    // fully visible, scrollable and clickable. On phones there's no room to coexist beside content,
    // so the panel itself goes full-width/full-height instead of gaining a separate scrim - inset-0
    // there is the sheet, not a dimmed overlay behind it.
    <div className="pointer-events-none fixed inset-0 z-[100] flex items-end justify-center sm:inset-auto sm:bottom-5 sm:right-5 sm:items-start sm:justify-start">
      <motion.div
        ref={panelRef}
        role="dialog"
        aria-modal="false"
        aria-label="Discussion"
        initial={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={reduceMotion ? { opacity: 0 } : { opacity: 0, y: 14, scale: 0.98 }}
        transition={{ duration: reduceMotion ? 0 : 0.2, ease: [0.22, 1, 0.36, 1] }}
        className="pointer-events-auto flex max-h-[85vh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl sm:max-h-[min(78vh,640px)] sm:w-[min(33rem,calc(100vw-2.5rem))] sm:rounded-2xl"
      >
        {/* Phone-only drag affordance, the same convention RaceQuickView's own sheet uses. */}
        <div aria-hidden className="flex shrink-0 justify-center pt-2.5 sm:hidden">
          <span className="h-1 w-9 rounded-full bg-white/20" />
        </div>

        {/* The post, pinned above the scrolling discussion so it never leaves the screen. */}
        <div className="shrink-0 border-b border-white/[0.07] px-4 pb-3.5 pt-3 sm:px-4 sm:pt-3.5">
          <div className="flex items-start gap-2">
            {/* showGroup is always true here - the window is effectively the post's own page,
                where "which community" is always relevant, not something a surrounding page has
                already established. */}
            <PostHeader post={post} showGroup roleLabel={roleLabel} pending={pending} />
            <button
              type="button"
              onClick={onClose}
              aria-label="Close discussion"
              className="-mr-1 -mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/40 text-white/70 transition hover:bg-black/60 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
            >
              <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden>
                <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
              </svg>
            </button>
          </div>

          <div className="mt-2.5 flex items-start gap-3">
            <div className="min-w-0 flex-1">
              {post.title && <p className="text-sm font-semibold text-white">{post.title}</p>}
              <p className={`whitespace-pre-wrap break-words text-[13.5px] leading-relaxed text-neutral-300 ${post.title ? "mt-1" : ""}`}>{post.content}</p>
            </div>
            {/* A thumbnail, not the full-bleed image: the discussion is what this panel is for,
                and the media is context for it. Non-image media (video/documents) has no useful
                still to show at this size, so it isn't faked with a generic tile. */}
            {post.mediaUrl && isImage && (
              // eslint-disable-next-line @next/next/no-img-element -- arbitrary user-uploaded Storage URLs, not a known-domain asset next/image can optimize
              <img src={post.mediaUrl} alt="" className="h-16 w-20 shrink-0 rounded-lg border border-white/[0.08] object-cover" />
            )}
          </div>

          <div className="mt-2.5 flex items-center gap-2">
            <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-1 py-0.5">
              <VoteControl score={score} myVote={myVote} onVote={onVote} compact />
            </div>
            <span className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-neutral-400">
              <svg viewBox="0 0 20 20" width="13" height="13" fill="none" aria-hidden>
                <path d="M3 4.5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8l-3.5 3v-3H3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
              </svg>
              <span className="tabular-nums">{totalCount}</span>
            </span>
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3.5 scrollbar-subtle">
          <div className="flex items-center justify-between gap-2">
            <p className="text-[13px] font-semibold text-white">
              {focused ? "This thread" : "Comments"}
              {!focused && totalCount > 0 && <span className="ml-1.5 text-xs font-normal tabular-nums text-neutral-500">{totalCount}</span>}
            </p>
            {!focused && totalCount > 1 && <CommentSortControl value={sort} onChange={setSort} />}
          </div>

          <div className="mt-2.5">
            {loading ? (
              <CommentsSkeleton count={3} />
            ) : error ? (
              <p className="py-2 text-xs text-neutral-500">
                Couldn&apos;t load the discussion.{" "}
                <button type="button" onClick={reload} className="text-neutral-300 underline-offset-2 hover:text-white hover:underline">
                  Retry
                </button>
              </p>
            ) : allRoots.length === 0 ? (
              <div className="py-5 text-center">
                <p className="text-sm font-medium text-neutral-300">No comments yet</p>
                <p className="mt-1 text-xs text-neutral-500">Be the first to reply.</p>
              </div>
            ) : (
              <>
                {/* No onOpenConversation: this IS the conversation view, so the tree flattens at
                    its depth limit rather than opening a second window over this one. */}
                <CommentTree roots={roots} childrenOf={tree.childrenOf} postId={post.id} onReply={add} onDiscard={discard} />
                {remaining > 0 && (
                  <button
                    type="button"
                    onClick={() => setVisibleThreads((n) => n + THREADS_PER_PAGE)}
                    className="mt-3 w-full rounded-xl border border-white/[0.08] bg-white/[0.02] px-3 py-2 text-xs font-medium text-neutral-300 transition hover:border-white/20 hover:bg-white/[0.05] hover:text-white"
                  >
                    Load more comments
                  </button>
                )}
              </>
            )}
          </div>
        </div>

        <footer className="shrink-0 border-t border-white/10 px-4 py-3">
          <CommentComposer variant="inline" onSubmit={(content) => add(content, focused ? focused.id : null)} placeholder={focused ? `Reply to ${focused.authorName}...` : "Write a comment..."} />
        </footer>
      </motion.div>
    </div>,
    document.body,
  );
}
