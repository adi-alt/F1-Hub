"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { PostActionBar } from "./PostActionBar";
import { PostContent } from "./PostContent";
import { PostDetailWindow } from "./PostDetailWindow";
import { PostHeader } from "./PostHeader";
import { PostMedia } from "./PostMedia";
import type { PostCardData } from "./types";
import { useOptimisticVote } from "./useOptimisticVote";

const ROLE_LABEL: Record<string, string> = { admin: "ADMIN", moderator: "MODERATOR" };

/** The one post card every surface in Groups renders - the home feed, a group's own Feed tab, and
 * (later, if a permalink page gets built) a post's own page all use this exact component, not
 * three parallel implementations of the same row. `showGroup` is the only real behavioral
 * difference: the home feed needs the group identity in the header, a group's own feed doesn't
 * (you're already looking at that group's page).
 *
 * The default container is a borderless row with a bottom divider, not a bordered box - a stream of
 * boxed cards is exactly the "card soup" a discussion feed shouldn't be; a divider is enough
 * separation once the post's own content (title/body) already carries the real visual weight.
 * `"compact"` (only `CommunitySection.tsx`, the homepage's activity feed) is unchanged - tighter
 * padding, same divider idea, it was already right about this. */
export function PostCard({
  post,
  index = 0,
  showGroup,
  canModerate = false,
  onModerated,
  variant = "default",
}: {
  post: PostCardData;
  index?: number;
  showGroup: boolean;
  canModerate?: boolean;
  onModerated?: (action: "approve" | "reject") => void;
  variant?: "default" | "compact";
}) {
  const { score, myVote, vote } = useOptimisticVote(`/api/posts/${post.id}/vote`, post.score, post.myVote);
  const [detailOpen, setDetailOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const status = post.status ?? "published";
  const roleLabel = post.authorRole && post.authorRole !== "member" ? ROLE_LABEL[post.authorRole] : undefined;

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
      className={variant === "compact" ? "border-b border-white/[0.06] py-3 last:border-b-0" : "border-b border-white/[0.06] py-4 first:pt-0 last:border-b-0"}
    >
      <PostHeader post={post} showGroup={showGroup} roleLabel={roleLabel} pending={status === "pending"} />

      <PostContent title={post.title} content={post.content} />
      {post.mediaUrl && <PostMedia url={post.mediaUrl} />}

      <PostActionBar score={score} myVote={myVote} onVote={vote} commentCount={commentCount} onOpenComments={() => setDetailOpen(true)} />

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

      {detailOpen && (
        <PostDetailWindow
          post={post}
          score={score}
          myVote={myVote}
          onVote={vote}
          roleLabel={roleLabel}
          pending={status === "pending"}
          focusCommentId={null}
          onClose={() => setDetailOpen(false)}
          onCountChange={setCommentCount}
        />
      )}
    </motion.div>
  );
}
