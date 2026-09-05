"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { CommentThread } from "./CommentThread";
import { PostActionBar } from "./PostActionBar";
import { PostContent } from "./PostContent";
import { PostHeader } from "./PostHeader";
import { PostMedia } from "./PostMedia";
import type { PostCardData } from "./types";
import { useOptimisticVote } from "./useOptimisticVote";

const ROLE_LABEL: Record<string, string> = { admin: "ADMIN", moderator: "MODERATOR" };

/** The one post card every surface in Groups renders - the home feed, a group's own Feed tab, and
 * (later, if a permalink page gets built) a post's own page all use this exact component, not
 * three parallel implementations of the same row. `showGroup` is the only real behavioral
 * difference: the home feed needs the group identity in the header, a group's own feed doesn't
 * (you're already looking at that group's page). */
export function PostCard({
  post,
  index = 0,
  showGroup,
  canModerate = false,
  onModerated,
}: {
  post: PostCardData;
  index?: number;
  showGroup: boolean;
  canModerate?: boolean;
  onModerated?: (action: "approve" | "reject") => void;
}) {
  const { score, myVote, vote } = useOptimisticVote(`/api/posts/${post.id}/vote`, post.score, post.myVote);
  const [showComments, setShowComments] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const status = post.status ?? "published";

  async function moderate(action: "approve" | "reject") {
    if (!post.groupId) return;
    await fetch(`/api/groups/${post.groupId}/posts/${post.id}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    onModerated?.(action);
  }

  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03, ease: "easeOut" }}
      className="rounded-lg border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-3.5"
    >
      <div className="flex items-center gap-2">
        <PostHeader post={post} showGroup={showGroup} />
        {post.authorRole && post.authorRole !== "member" && (
          <span className="text-[10px] font-semibold uppercase tracking-wide text-neutral-500">{ROLE_LABEL[post.authorRole]}</span>
        )}
        {status === "pending" && <span className="text-[10px] font-semibold uppercase tracking-wide text-amber-400">Pending approval</span>}
      </div>

      <PostContent title={post.title} content={post.content} />
      {post.mediaUrl && <PostMedia url={post.mediaUrl} />}

      <PostActionBar score={score} myVote={myVote} onVote={vote} commentCount={commentCount} showComments={showComments} onToggleComments={() => setShowComments((v) => !v)} />

      {canModerate && status === "pending" && (
        <div className="mt-2 flex gap-3 border-t border-[var(--f1-line)] pt-2">
          <button type="button" onClick={() => void moderate("approve")} className="text-xs font-medium text-emerald-400 hover:text-emerald-300">
            Approve
          </button>
          <button type="button" onClick={() => void moderate("reject")} className="text-xs font-medium text-[var(--f1-red)] hover:brightness-125">
            Remove
          </button>
        </div>
      )}
      {canModerate && status === "published" && (
        <div className="mt-2 border-t border-[var(--f1-line)] pt-2 text-right">
          <button type="button" onClick={() => void moderate("reject")} className="text-xs text-neutral-600 hover:text-[var(--f1-red)]">
            Remove
          </button>
        </div>
      )}

      {showComments && <CommentThread postId={post.id} onCountChange={setCommentCount} />}
    </motion.div>
  );
}
