"use client";

import { useState } from "react";
import { timeAgo } from "@/lib/format";
import { CommentComposer } from "./CommentComposer";
import { useOptimisticVote } from "./useOptimisticVote";
import { VoteControl } from "./VoteControl";
import { countDescendants, type LocalComment } from "./useComments";

/** Two levels of visible nesting, then the thread flattens into a "View conversation" link rather
 * than marching further right until the text is a column one word wide. Deliberately a constant
 * rather than a prop - the whole point is that every surface agrees on it. */
export const MAX_VISIBLE_DEPTH = 2;

export function CommentTree({
  roots,
  childrenOf,
  postId,
  onReply,
  onDiscard,
  /** Called when a deep thread wants to open in the side panel, focused on that comment. Absent in
   * the drawer itself, where there's nowhere further to escalate to - it flattens instead. */
  onOpenConversation,
}: {
  roots: LocalComment[];
  childrenOf: Map<string, LocalComment[]>;
  postId: string;
  onReply: (content: string, parentCommentId: string | null) => Promise<boolean>;
  onDiscard: (id: string) => void;
  onOpenConversation?: (commentId: string) => void;
}) {
  return (
    <div className="space-y-3">
      {roots.map((comment) => (
        <CommentNode
          key={comment.id}
          comment={comment}
          childrenOf={childrenOf}
          postId={postId}
          depth={0}
          onReply={onReply}
          onDiscard={onDiscard}
          onOpenConversation={onOpenConversation}
        />
      ))}
    </div>
  );
}

function CommentNode({
  comment,
  childrenOf,
  postId,
  depth,
  onReply,
  onDiscard,
  onOpenConversation,
}: {
  comment: LocalComment;
  childrenOf: Map<string, LocalComment[]>;
  postId: string;
  depth: number;
  onReply: (content: string, parentCommentId: string | null) => Promise<boolean>;
  onDiscard: (id: string) => void;
  onOpenConversation?: (commentId: string) => void;
}) {
  const { score, myVote, vote } = useOptimisticVote(`/api/posts/${postId}/comments/${comment.id}/vote`, comment.score, comment.myVote);
  const [replying, setReplying] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  const children = childrenOf.get(comment.id) ?? [];
  const atDepthLimit = depth >= MAX_VISIBLE_DEPTH;
  const hiddenCount = atDepthLimit ? countDescendants(comment.id, childrenOf) : 0;

  if (comment.failed) {
    return (
      <div className={indent(depth)}>
        <div className="rounded-lg border border-[var(--f1-red)]/40 bg-[var(--f1-red)]/[0.05] px-3 py-2">
          <p className="text-[11px] font-semibold text-[var(--f1-red)]">Couldn&apos;t post this reply.</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-neutral-300">{comment.content}</p>
          <div className="mt-1.5 flex items-center gap-3">
            <button type="button" onClick={() => void onReply(comment.content, comment.parentCommentId)} className="text-xs font-semibold text-white underline-offset-2 hover:underline">
              Retry
            </button>
            <button type="button" onClick={() => onDiscard(comment.id)} className="text-xs text-neutral-500 transition hover:text-neutral-300">
              Discard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={indent(depth)}>
      <div className={comment.pending ? "opacity-60" : ""}>
        <p className="text-xs">
          <span className="font-semibold text-neutral-300">{comment.authorName}</span>{" "}
          <span className="text-neutral-600">{comment.pending ? "Sending…" : timeAgo(comment.createdAt)}</span>
        </p>
        <p className="mt-0.5 whitespace-pre-wrap break-words text-sm text-neutral-300">{comment.content}</p>

        <div className="mt-1 flex flex-wrap items-center gap-3">
          <VoteControl score={score} myVote={myVote} onVote={vote} compact />
          {!comment.pending && (
            <button type="button" onClick={() => setReplying((v) => !v)} className="text-xs text-neutral-500 transition hover:text-white">
              Reply
            </button>
          )}
          {!atDepthLimit && children.length > 0 && (
            <button type="button" onClick={() => setCollapsed((v) => !v)} className="text-xs text-neutral-500 transition hover:text-white">
              {collapsed ? `Show ${children.length} repl${children.length === 1 ? "y" : "ies"}` : "Collapse"}
            </button>
          )}
        </div>
      </div>

      {replying && (
        <div className="mt-2">
          <CommentComposer
            autoFocus
            onCancel={() => setReplying(false)}
            onSubmit={async (content) => {
              const ok = await onReply(content, comment.id);
              if (ok) setReplying(false);
              return ok;
            }}
            placeholder={`Reply to ${comment.authorName}...`}
          />
        </div>
      )}

      {/* Past the depth limit the subtree stops rendering entirely and offers one link instead. In
          the drawer (no onOpenConversation) there's nowhere to escalate to, so it keeps rendering
          flat at the limit rather than dead-ending the reader. */}
      {atDepthLimit && hiddenCount > 0 && onOpenConversation && (
        <button
          type="button"
          onClick={() => onOpenConversation(comment.id)}
          className="mt-1.5 text-xs font-medium text-neutral-400 underline-offset-2 transition hover:text-white hover:underline"
        >
          View conversation ({hiddenCount} more)
        </button>
      )}

      {!collapsed && children.length > 0 && (!atDepthLimit || !onOpenConversation) && (
        <div className="mt-2 space-y-2">
          {children.map((child) => (
            <CommentNode
              key={child.id}
              comment={child}
              childrenOf={childrenOf}
              postId={postId}
              // Held at the limit rather than incremented, so a very deep thread in the drawer
              // stays readable instead of indenting off the right edge.
              depth={Math.min(depth + 1, MAX_VISIBLE_DEPTH)}
              onReply={onReply}
              onDiscard={onDiscard}
              onOpenConversation={onOpenConversation}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function indent(depth: number): string {
  return depth > 0 ? "ml-3 border-l border-[var(--f1-line)] pl-3" : "";
}

export function CommentSortControl({ value, onChange }: { value: "top" | "newest"; onChange: (sort: "top" | "newest") => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Sort comments">
      {(["top", "newest"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`rounded-full px-2 py-0.5 text-[11px] font-medium transition ${
            value === option ? "bg-white/[0.08] text-white" : "text-neutral-500 hover:text-neutral-300"
          }`}
        >
          {option === "top" ? "Top" : "Newest"}
        </button>
      ))}
    </div>
  );
}
