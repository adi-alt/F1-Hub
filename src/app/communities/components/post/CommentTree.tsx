"use client";

import { useState } from "react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useAuth } from "@/providers/AuthProvider";
import { timeAgo } from "@/lib/format";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
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
  const { user } = useAuth();
  const [replying, setReplying] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [content, setContent] = useState(comment.content);
  const [editedAt, setEditedAt] = useState(comment.editedAt ?? null);
  const [gone, setGone] = useState(!!comment.deleted);

  async function saveEdit(next: string): Promise<boolean> {
    const res = await fetch(`/api/posts/${postId}/comments/${comment.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: next }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { editedAt?: string } | null;
    if (!res?.ok || !body?.editedAt) return false;
    setContent(next.trim());
    setEditedAt(body.editedAt);
    setEditing(false);
    return true;
  }
  // The commenter's profile photo (profiles.avatar_url); for the viewer's own fresh comment, their session photo.
  // Initials only where there's no photo at all.
  const isMe = !!user && !!comment.userId && user.uid === comment.userId;
  const avatarUrl = comment.authorAvatarUrl ?? (isMe ? (user.photoURL ?? null) : null);

  const children = childrenOf.get(comment.id) ?? [];
  const atDepthLimit = depth >= MAX_VISIBLE_DEPTH;
  const hiddenCount = atDepthLimit ? countDescendants(comment.id, childrenOf) : 0;

  if (comment.failed) {
    return (
      <div className={indent(depth)}>
        <div className="rounded-lg border border-brand/40 bg-brand/5 px-3 py-2">
          <p className="text-caption font-semibold text-brand-text">Couldn&apos;t post this reply.</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-secondary">{comment.content}</p>
          <div className="mt-1.5 flex items-center gap-3">
            <button type="button" onClick={() => void onReply(comment.content, comment.parentCommentId)} className="text-xs font-semibold text-white underline-offset-2 hover:underline">
              Retry
            </button>
            <button type="button" onClick={() => onDiscard(comment.id)} className="text-xs text-tertiary transition hover:text-secondary">
              Discard
            </button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className={indent(depth)}>
      <div className={`flex gap-2.5 ${comment.pending ? "opacity-60" : ""}`}>
        <EntityAvatar imageUrl={avatarUrl} name={comment.authorName} seed={comment.userId || comment.authorName} size={28} />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-1.5 text-xs">
            <span className="font-semibold text-neutral-200">
              <span aria-hidden className="mr-1 font-mono text-caption font-normal text-tertiary">
                U/
              </span>
              {comment.authorName}
            </span>
            <span className="text-tertiary">{comment.pending ? "Sending…" : timeAgo(comment.createdAt)}</span>
          </p>
          {gone ? (
            <p className="mt-1 text-body-sm italic text-tertiary">Comment deleted</p>
          ) : editing ? (
            <div className="mt-1.5">
              <CommentComposer autoFocus initialValue={content} submitLabel="Save" onCancel={() => setEditing(false)} onSubmit={saveEdit} placeholder="Edit your comment..." />
            </div>
          ) : (
            <p className="mt-1 whitespace-pre-wrap break-words text-body-sm leading-relaxed text-secondary">
              {content}
              {editedAt && <span className="ml-1.5 text-caption text-tertiary">(edited)</span>}
            </p>
          )}

          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <VoteControl score={score} myVote={myVote} onVote={vote} compact />
            {!comment.pending && (
              <button type="button" onClick={() => setReplying((v) => !v)} className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-xs text-tertiary transition hover:bg-white/[0.05] hover:text-white">
                <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden>
                  <path d="M2.5 4h11a.8.8 0 0 1 .8.8v6a.8.8 0 0 1-.8.8H6.2L3.5 14v-2.4H2.5a.8.8 0 0 1-.8-.8v-6A.8.8 0 0 1 2.5 4Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round" />
                </svg>
                Reply
              </button>
            )}
            {!comment.pending && !gone && (
              <CommentActions
                postId={postId}
                commentId={comment.id}
                mine={!!comment.mine}
                canDelete={!!comment.canDelete}
                onEdit={() => setEditing(true)}
                onDeleted={() => setGone(true)}
              />
            )}
            {!atDepthLimit && children.length > 0 && (
              <button type="button" onClick={() => setCollapsed((v) => !v)} className="rounded-lg px-2 py-1 text-xs text-tertiary transition hover:bg-white/[0.05] hover:text-white">
                {collapsed ? `Show ${children.length} repl${children.length === 1 ? "y" : "ies"}` : "Collapse"}
              </button>
            )}
          </div>
        </div>
      </div>

      {replying && (
        <div className="ml-[38px] mt-2">
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
          className="ml-[38px] mt-1.5 text-xs font-medium text-secondary underline-offset-2 transition hover:text-white hover:underline"
        >
          View conversation ({hiddenCount} more)
        </button>
      )}

      {!collapsed && children.length > 0 && (!atDepthLimit || !onOpenConversation) && (
        <div className="mt-3 space-y-3">
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

const ACTION = "rounded-lg px-2 py-1 text-xs text-tertiary transition hover:bg-white/[0.05] hover:text-white";

/** Edit and delete for the author (delete for a moderator too), Report for everyone else. */
function CommentActions({ postId, commentId, mine, canDelete, onEdit, onDeleted }: { postId: string; commentId: string; mine: boolean; canDelete: boolean; onEdit: () => void; onDeleted: () => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);

  async function remove() {
    setBusy(true);
    setError("");
    const res = await fetch(`/api/posts/${postId}/comments/${commentId}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    if (res?.ok) onDeleted();
    else setError("Couldn't delete it.");
  }

  async function report(reason: string): Promise<boolean> {
    const res = await fetch(`/api/posts/${postId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, commentId }),
    }).catch(() => null);
    if (!res?.ok) return false;
    setReporting(false);
    setReported(true);
    return true;
  }

  return (
    <>
      {mine && (
        <button type="button" onClick={onEdit} className={ACTION}>
          Edit
        </button>
      )}
      {canDelete && (
        <ConfirmButton onConfirm={() => void remove()} question={mine ? "Delete?" : "Remove?"} confirmLabel={mine ? "Delete" : "Remove"} pending={busy} className={ACTION}>
          {mine ? "Delete" : "Remove"}
        </ConfirmButton>
      )}
      {!mine &&
        (reported ? (
          <span className="px-2 py-1 text-xs text-tertiary">Reported</span>
        ) : (
          <button type="button" onClick={() => setReporting((v) => !v)} className={ACTION}>
            Report
          </button>
        ))}
      {error && (
        <span role="alert" className="text-xs text-danger">
          {error}
        </span>
      )}
      {reporting && (
        <div className="mt-1.5 w-full">
          <CommentComposer autoFocus submitLabel="Report" onCancel={() => setReporting(false)} onSubmit={report} placeholder="What's wrong with it? Only moderators see this." />
        </div>
      )}
    </>
  );
}

/** Replies sit under their parent's avatar column, with a hairline rule marking the thread - enough
 * to read as nested without marching right until the text is one word wide. */
function indent(depth: number): string {
  return depth > 0 ? "ml-[38px] border-l border-white/10 pl-3" : "";
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
          className={`rounded-full px-2 py-0.5 text-caption font-medium transition ${
            value === option ? "bg-white/[0.08] text-white" : "text-tertiary hover:text-secondary"
          }`}
        >
          {option === "top" ? "Top" : "Newest"}
        </button>
      ))}
    </div>
  );
}
