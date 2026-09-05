"use client";

import { useState } from "react";
import { timeAgo } from "@/lib/format";
import type { PostComment } from "@/lib/supabase/groupPosts";
import { CommentComposer } from "./CommentComposer";
import { useOptimisticVote } from "./useOptimisticVote";
import { VoteControl } from "./VoteControl";

/** Recursive - each reply is a CommentItem rendering its own replies the same way, indented one
 * step further (a left border, not a full nested-card look - "comments should visually belong to
 * the post", not read as separate cards). Collapsing a thread hides its children only, never the
 * comment itself. */
export function CommentItem({
  comment,
  allComments,
  postId,
  depth,
  onReplyAdded,
}: {
  comment: PostComment;
  allComments: PostComment[];
  postId: string;
  depth: number;
  onReplyAdded: () => void;
}) {
  const { score, myVote, vote } = useOptimisticVote(`/api/posts/${postId}/comments/${comment.id}/vote`, comment.score, comment.myVote);
  const [replying, setReplying] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const children = allComments.filter((c) => c.parentCommentId === comment.id);

  async function submitReply(content: string): Promise<boolean> {
    const res = await fetch(`/api/posts/${postId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content, parentCommentId: comment.id }),
    });
    if (res.ok) {
      setReplying(false);
      onReplyAdded();
    }
    return res.ok;
  }

  return (
    <div className={depth > 0 ? "ml-4 border-l border-[var(--f1-line)] pl-3" : ""}>
      <div className="text-xs">
        <span className="font-semibold text-neutral-300">{comment.authorName}</span> <span className="text-neutral-600">{timeAgo(comment.createdAt)}</span>
      </div>
      <p className="mt-0.5 whitespace-pre-wrap text-sm text-neutral-300">{comment.content}</p>
      <div className="mt-1 flex items-center gap-3">
        <VoteControl score={score} myVote={myVote} onVote={vote} compact />
        <button type="button" onClick={() => setReplying((v) => !v)} className="text-xs text-neutral-500 transition hover:text-white">
          Reply
        </button>
        {children.length > 0 && (
          <button type="button" onClick={() => setCollapsed((v) => !v)} className="text-xs text-neutral-500 transition hover:text-white">
            {collapsed ? `Show ${children.length} repl${children.length === 1 ? "y" : "ies"}` : "Collapse"}
          </button>
        )}
      </div>

      {replying && (
        <div className="mt-2">
          <CommentComposer autoFocus onCancel={() => setReplying(false)} onSubmit={submitReply} placeholder={`Reply to ${comment.authorName}...`} />
        </div>
      )}

      {!collapsed && children.length > 0 && (
        <div className="mt-2 space-y-2">
          {children.map((child) => (
            <CommentItem key={child.id} comment={child} allComments={allComments} postId={postId} depth={depth + 1} onReplyAdded={onReplyAdded} />
          ))}
        </div>
      )}
    </div>
  );
}
