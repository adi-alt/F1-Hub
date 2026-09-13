"use client";

import { useEffect, useMemo } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { timeAgo } from "@/lib/format";
import type { PostCardData } from "./types";
import { CommentComposer } from "./CommentComposer";
import { CommentsSkeleton } from "./CommentSkeleton";
import { CommentSortControl, CommentTree } from "./CommentTree";
import { useComments, type LocalComment } from "./useComments";

/**
 * The right-side discussion panel: the same comment tree as the inline thread, with room to read
 * it. Opened either for a whole post (long conversations) or focused on one sub-thread that hit the
 * inline nesting limit.
 *
 * A panel rather than a full page, because the feed behind it keeps its scroll position - the
 * explicit ask was that a discussion never costs you your place.
 *
 * It runs its own useComments instance. That means one extra fetch when it opens, which is the
 * deliberate trade for it being independently openable (and for the inline thread underneath not
 * having to stay mounted). Both read the same endpoint, so they can't disagree about content - only
 * momentarily about freshness.
 */
export function CommentDrawer({
  post,
  focusCommentId,
  onClose,
  onCountChange,
}: {
  post: PostCardData;
  /** When set, the panel shows only this comment's sub-thread, with a way back to the whole post. */
  focusCommentId: string | null;
  onClose: () => void;
  onCountChange?: (count: number) => void;
}) {
  const { comments, tree, sort, setSort, add, discard, reload, error, loading } = useComments(post.id, onCountChange);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  // When focused on a sub-thread, that comment becomes the root of what's rendered.
  const focused = useMemo<LocalComment | null>(() => (focusCommentId ? ((comments ?? []).find((c) => c.id === focusCommentId) ?? null) : null), [comments, focusCommentId]);
  const roots = focused ? [focused] : tree.roots;

  return createPortal(
    <div className="fixed inset-0 z-[110] flex justify-end bg-black/50 backdrop-blur-[2px]" onClick={onClose}>
      <motion.aside
        role="dialog"
        aria-modal="true"
        aria-label="Discussion"
        initial={{ x: 32, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        exit={{ x: 32, opacity: 0 }}
        transition={{ duration: 0.18, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-full flex-col border-l border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl sm:max-w-md"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-4 py-3">
          <h2 className="text-sm font-semibold text-white">Discussion</h2>
          <button
            onClick={onClose}
            aria-label="Close discussion"
            className="flex h-7 w-7 items-center justify-center rounded-full bg-black/40 text-white/70 transition hover:bg-black/60 hover:text-white"
          >
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden>
              <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-4 py-4">
          {/* The post itself, so replies have their subject in view rather than needing memory. */}
          <div className="rounded-lg border border-[var(--f1-line)] bg-black/20 p-3">
            <p className="text-xs text-neutral-500">
              {post.authorName} · {timeAgo(post.createdAt)}
            </p>
            {post.title && <p className="mt-1 text-sm font-semibold text-white">{post.title}</p>}
            <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-neutral-300">{post.content}</p>
          </div>

          <div className="mt-4 flex items-center justify-between">
            <p className="text-xs font-semibold uppercase tracking-wide text-neutral-500">
              {focused ? "This thread" : `${comments?.length ?? 0} comment${(comments?.length ?? 0) === 1 ? "" : "s"}`}
            </p>
            {!focused && (comments?.length ?? 0) > 1 && <CommentSortControl value={sort} onChange={setSort} />}
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
              <p className="text-xs text-neutral-600">No comments yet.</p>
            ) : (
              // No onOpenConversation here: this IS the conversation view, so the tree keeps
              // rendering flat at the depth limit rather than offering to escalate to itself.
              <CommentTree roots={roots} childrenOf={tree.childrenOf} postId={post.id} onReply={add} onDiscard={discard} />
            )}
          </div>
        </div>

        <footer className="shrink-0 border-t border-white/10 px-4 py-3">
          <CommentComposer onSubmit={(content) => add(content, focused ? focused.id : null)} placeholder={focused ? `Reply to ${focused.authorName}...` : "Write a reply..."} />
        </footer>
      </motion.aside>
    </div>,
    document.body,
  );
}
