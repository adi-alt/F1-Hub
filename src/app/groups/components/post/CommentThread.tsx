"use client";

import { useCallback, useEffect, useState } from "react";
import type { PostComment } from "@/lib/supabase/groupPosts";
import { CommentComposer } from "./CommentComposer";
import { CommentItem } from "./CommentItem";
import { CommentsSkeleton } from "./CommentSkeleton";

/** Inline under the post - never a navigation away from the feed (the request's own major change
 * here). Flat fetch, tree built client-side (see PostComment's own parentCommentId) - a handful of
 * comments per post at most, cheap to nest in JS. */
export function CommentThread({ postId, onCountChange }: { postId: string; onCountChange?: (count: number) => void }) {
  const [comments, setComments] = useState<PostComment[] | null>(null);

  const load = useCallback(() => {
    fetch(`/api/posts/${postId}/comments`)
      .then((res) => res.json())
      .then((body: { comments: PostComment[] }) => {
        setComments(body.comments);
        onCountChange?.(body.comments.length);
      })
      .catch(() => setComments([]));
    // onCountChange is a fresh closure every render from the caller's own state setter - it's
    // stable enough in practice (setState identity), and re-running this on every render would
    // just refetch pointlessly.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [postId]);

  useEffect(() => {
    load();
  }, [load]);

  async function submitTopLevel(content: string): Promise<boolean> {
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content }),
    });
    if (res.ok) load();
    return res.ok;
  }

  const topLevel = (comments ?? []).filter((c) => c.parentCommentId === null);

  return (
    <div className="mt-3 space-y-3 border-t border-[var(--f1-line)] pt-3">
      <CommentComposer onSubmit={submitTopLevel} placeholder="What do you think?" />
      {comments === null ? (
        <CommentsSkeleton />
      ) : topLevel.length === 0 ? (
        <p className="text-xs text-neutral-600">No comments yet - be the first.</p>
      ) : (
        <div className="space-y-3">
          {topLevel.map((c) => (
            <CommentItem key={c.id} comment={c} allComments={comments} postId={postId} depth={0} onReplyAdded={load} />
          ))}
        </div>
      )}
    </div>
  );
}
