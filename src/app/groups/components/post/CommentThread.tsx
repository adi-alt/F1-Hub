"use client";

import { useState } from "react";
import type { PostCardData } from "./types";
import { CommentComposer } from "./CommentComposer";
import { CommentDrawer } from "./CommentDrawer";
import { CommentsSkeleton } from "./CommentSkeleton";
import { CommentSortControl, CommentTree } from "./CommentTree";
import { useComments } from "./useComments";

/** Above this many comments, reading inline under the post stops being comfortable and the panel
 * is offered instead. Below it, inline is strictly better - no context switch for three replies. */
const DRAWER_SUGGESTION_THRESHOLD = 8;

/**
 * The inline discussion under a post. Short conversations live here; long or deep ones escalate to
 * the side panel, which is the same tree with more room.
 *
 * Neither is a separate page: the request was explicit that opening a discussion shouldn't
 * navigate away from the feed, so both keep the reader's scroll position intact.
 */
export function CommentThread({ post, onCountChange }: { post: PostCardData; onCountChange?: (count: number) => void }) {
  const { comments, tree, sort, setSort, add, discard, reload, error, loading } = useComments(post.id, onCountChange);
  const [drawerFocus, setDrawerFocus] = useState<string | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const total = comments?.length ?? 0;

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--f1-line)] pt-3">
      <CommentComposer onSubmit={(content) => add(content, null)} placeholder="What do you think?" />

      {total > 1 && (
        <div className="flex items-center justify-between">
          <CommentSortControl value={sort} onChange={setSort} />
          {total >= DRAWER_SUGGESTION_THRESHOLD && (
            <button
              type="button"
              onClick={() => {
                setDrawerFocus(null);
                setDrawerOpen(true);
              }}
              className="text-[11px] text-neutral-500 transition hover:text-white"
            >
              Open in panel
            </button>
          )}
        </div>
      )}

      {loading ? (
        <CommentsSkeleton />
      ) : error ? (
        <p className="text-xs text-neutral-500">
          Couldn&apos;t load the discussion.{" "}
          <button type="button" onClick={reload} className="text-neutral-300 underline-offset-2 hover:text-white hover:underline">
            Retry
          </button>
        </p>
      ) : tree.roots.length === 0 ? (
        <p className="text-xs text-neutral-600">No comments yet - be the first.</p>
      ) : (
        <CommentTree
          roots={tree.roots}
          childrenOf={tree.childrenOf}
          postId={post.id}
          onReply={add}
          onDiscard={discard}
          onOpenConversation={(commentId) => {
            setDrawerFocus(commentId);
            setDrawerOpen(true);
          }}
        />
      )}

      {drawerOpen && <CommentDrawer post={post} focusCommentId={drawerFocus} onClose={() => setDrawerOpen(false)} onCountChange={onCountChange} />}
    </div>
  );
}
