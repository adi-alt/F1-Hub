"use client";

import { useState } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { timeAgo } from "@/lib/format";
import { groupHref } from "@/lib/routes";
import type { FeedPost } from "@/lib/supabase/groupPosts";
import { CommentThread } from "./CommentThread";

/** Reddit-style, not a dashboard card - group identity + time, then straight to the content, then
 * a plain action row. No media (posts are text-only right now - see groupPosts' own schema, no
 * media column exists yet), no downvote (the app's up-only vote model, unchanged here). */
export function FeedPostCard({ post, index, onVoted, onCommentAdded }: { post: FeedPost; index: number; onVoted: (id: string, voted: boolean) => void; onCommentAdded: (id: string) => void }) {
  const [showComments, setShowComments] = useState(false);
  const [voting, setVoting] = useState(false);

  async function vote() {
    if (voting) return;
    setVoting(true);
    onVoted(post.id, !post.hasVoted);
    const res = await fetch(`/api/groups/${post.groupId}/posts/${post.id}/vote`, { method: "POST" });
    if (!res.ok) onVoted(post.id, post.hasVoted); // revert on failure
    setVoting(false);
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03, ease: "easeOut" }}
      className="rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-4"
    >
      <div className="flex items-center gap-2">
        <Link href={groupHref(post.groupId)} className="flex items-center gap-1.5 text-xs font-semibold text-neutral-300 hover:text-white">
          <EntityAvatar imageUrl={post.groupAvatarUrl} name={post.groupName} size={18} />
          {post.groupName}
        </Link>
        <span className="text-xs text-neutral-600">· {post.authorName} · {timeAgo(post.createdAt)}</span>
      </div>
      <p className="mt-2 whitespace-pre-wrap text-sm text-neutral-200">{post.content}</p>

      <div className="mt-3 flex items-center gap-4 text-xs text-neutral-500">
        <button onClick={() => void vote()} className={`flex items-center gap-1 transition hover:text-white ${post.hasVoted ? "text-[var(--f1-red)]" : ""}`}>
          ↑ {post.upvotes}
        </button>
        <button onClick={() => setShowComments((v) => !v)} className="flex items-center gap-1 transition hover:text-white">
          💬 {post.commentCount}
        </button>
        <Link href={groupHref(post.groupId)} className="ml-auto transition hover:text-white">
          View in group →
        </Link>
      </div>

      {showComments && <CommentThread groupId={post.groupId} postId={post.id} onAdded={() => onCommentAdded(post.id)} />}
    </motion.div>
  );
}
