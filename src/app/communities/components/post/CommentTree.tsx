"use client";

import { PersonAvatar } from "@/components/avatar/PersonAvatar";
import { Fragment, useState } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { timeAgo } from "@/lib/format";
import { safeHttpUrl } from "@/lib/linkPreview";
import { COMMENT_REACTIONS, type CommentReactionEmoji } from "@/lib/communities";
import { Badge } from "@/components/ui/Badge";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Popover } from "@/components/ui/Popover";
import { CommentComposer } from "./CommentComposer";
import { useOptimisticVote } from "./useOptimisticVote";
import { VoteControl } from "./VoteControl";
import { countDescendants, type CommentSort, type LocalComment } from "./useComments";

/** Two levels of visible nesting, then the thread flattens into a "View conversation" link rather
 * than marching further right until the text is a column one word wide. Deliberately a constant
 * rather than a prop - the whole point is that every surface agrees on it. */
export const MAX_VISIBLE_DEPTH = 2;

const COMMENT_TRUNCATE_AT = 420;
const TOKEN_PATTERN = /(https?:\/\/[^\s<>"']+|@[a-zA-Z0-9_.-]+)/gi;

export function CommentTree({
  roots,
  childrenOf,
  postId,
  onReply,
  onDiscard,
  onTogglePin,
  onToggleAccept,
  onToggleReaction,
  commentsLocked,
  onShareComment,
  highlightedCommentId,
  /** Called when a deep thread wants to open in the side panel, focused on that comment. Absent in
   * the drawer itself, where there's nowhere further to escalate to - it flattens instead. */
  onOpenConversation,
}: {
  roots: LocalComment[];
  childrenOf: Map<string, LocalComment[]>;
  postId: string;
  onReply: (content: string, parentCommentId: string | null, mediaUrl?: string | null) => Promise<boolean>;
  onDiscard: (id: string) => void;
  onTogglePin?: (commentId: string, pinned: boolean) => Promise<void> | void;
  onToggleAccept?: (commentId: string, accepted: boolean) => Promise<void> | void;
  onToggleReaction?: (commentId: string, emoji: CommentReactionEmoji) => Promise<void> | void;
  commentsLocked: boolean;
  onShareComment?: (id: string) => Promise<boolean>;
  highlightedCommentId?: string | null;
  onOpenConversation?: (commentId: string) => void;
}) {
  return (
    <div className="space-y-3.5">
      {roots.map((comment) => (
        <CommentNode
          key={comment.id}
          comment={comment}
          childrenOf={childrenOf}
          postId={postId}
          depth={0}
          onReply={onReply}
          onDiscard={onDiscard}
          onTogglePin={onTogglePin}
          onToggleAccept={onToggleAccept}
          onToggleReaction={onToggleReaction}
          commentsLocked={commentsLocked}
          onShareComment={onShareComment}
          highlightedCommentId={highlightedCommentId}
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
  onTogglePin,
  onToggleAccept,
  onToggleReaction,
  commentsLocked,
  onShareComment,
  highlightedCommentId,
  onOpenConversation,
}: {
  comment: LocalComment;
  childrenOf: Map<string, LocalComment[]>;
  postId: string;
  depth: number;
  onReply: (content: string, parentCommentId: string | null, mediaUrl?: string | null) => Promise<boolean>;
  onDiscard: (id: string) => void;
  onTogglePin?: (commentId: string, pinned: boolean) => Promise<void> | void;
  onToggleAccept?: (commentId: string, accepted: boolean) => Promise<void> | void;
  onToggleReaction?: (commentId: string, emoji: CommentReactionEmoji) => Promise<void> | void;
  commentsLocked: boolean;
  onShareComment?: (id: string) => Promise<boolean>;
  highlightedCommentId?: string | null;
  onOpenConversation?: (commentId: string) => void;
}) {
  const { score, myVote, vote } = useOptimisticVote(`/api/posts/${postId}/comments/${comment.id}/vote`, comment.score, comment.myVote);
  const { user, avatar: myAvatar } = useAuth();
  const [replying, setReplying] = useState(false);
  const [quoteText, setQuoteText] = useState<string | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [editing, setEditing] = useState(false);
  const [reporting, setReporting] = useState(false);
  const [reported, setReported] = useState(false);
  const [shared, setShared] = useState(false);
  const [actionError, setActionError] = useState("");
  const [content, setContent] = useState(comment.content);
  const [editedAt, setEditedAt] = useState(comment.editedAt ?? null);

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

  async function submitReport(reason: string): Promise<boolean> {
    const res = await fetch(`/api/posts/${postId}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason, commentId: comment.id }),
    }).catch(() => null);
    if (!res?.ok) return false;
    setReporting(false);
    setReported(true);
    return true;
  }

  async function handleShare() {
    if (!onShareComment) return;
    const ok = await onShareComment(comment.id);
    if (ok) {
      setShared(true);
      window.setTimeout(() => setShared(false), 2000);
    }
  }

  function handleQuote() {
    const clean = content
      .split("\n")
      .filter((line) => !line.trimStart().startsWith(">"))
      .join(" ")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 140);
    const snippet = clean || "Media attachment";
    setQuoteText(`> @${comment.authorName}: ${snippet}`);
    setReplying(true);
  }

  const isMe = !!user && !!comment.userId && user.uid === comment.userId;
  const avatar = comment.authorAvatar ?? (isMe ? myAvatar : null);

  const children = childrenOf.get(comment.id) ?? [];
  const totalDescendants = countDescendants(comment.id, childrenOf);
  const atDepthLimit = depth >= MAX_VISIBLE_DEPTH;
  const hiddenCount = atDepthLimit ? totalDescendants : 0;
  const isHighlighted = Boolean(highlightedCommentId && highlightedCommentId === comment.id);
  const reactions = comment.reactions ?? [];

  if (comment.failed) {
    return (
      <div className={indent(depth)}>
        <div className="rounded-card border border-brand/40 bg-brand/5 px-3 py-2">
          <p className="text-caption font-semibold text-brand-text">Couldn&apos;t post this reply.</p>
          {comment.content && <p className="mt-1 whitespace-pre-wrap text-body-sm text-secondary">{comment.content}</p>}
          <div className="mt-1.5 flex items-center gap-3">
            <button
              type="button"
              onClick={() => void onReply(comment.content, comment.parentCommentId, comment.mediaUrl)}
              className="rounded-control text-caption font-semibold text-primary underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              Retry
            </button>
            <button
              type="button"
              onClick={() => onDiscard(comment.id)}
              className="rounded-control text-caption text-tertiary transition-colors hover:text-secondary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              Discard
            </button>
          </div>
        </div>
      </div>
    );
  }

  const cardSurface = comment.accepted
    ? "rounded-card border border-success/30 bg-success/[0.04] p-2.5"
    : comment.pinned
      ? "rounded-card border border-warning/25 bg-warning/[0.03] p-2.5"
      : isHighlighted
        ? "rounded-card border border-brand/35 bg-brand/[0.04] p-2.5"
        : "";

  return (
    <div className={indent(depth)}>
      <div className={cardSurface}>
        <div className={`flex gap-2.5 ${comment.pending ? "opacity-60" : ""}`}>
          <div className="flex flex-col items-center">
            <PersonAvatar id={comment.userId || comment.authorName} avatar={avatar} size={28} />
            {children.length > 0 && !collapsed && (
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label={`Collapse thread by ${comment.authorName}`}
                title="Collapse thread"
                className="group/spine mt-1.5 flex w-5 flex-1 justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <span className="h-full w-px bg-white/10 transition-colors group-hover/spine:w-0.5 group-hover/spine:bg-white/35" />
              </button>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-caption">
              <span className="font-semibold text-primary">{comment.authorName}</span>
              {comment.isOp && <Badge tone="info">OP</Badge>}
              {comment.authorRole === "admin" && <Badge tone="neutral">Admin</Badge>}
              {comment.authorRole === "moderator" && <Badge tone="neutral">Mod</Badge>}
              {comment.accepted && <Badge tone="success">✓ Answered</Badge>}
              {comment.pinned && <Badge tone="warning">Pinned</Badge>}
              {depth >= MAX_VISIBLE_DEPTH && comment.parentAuthorName && (
                <span className="rounded-control bg-white/[0.05] px-1.5 py-0.5 text-caption text-tertiary">
                  ↳ @{comment.parentAuthorName}
                </span>
              )}
              <span className="text-tertiary">·</span>
              <span className="text-tertiary">{comment.pending ? "Sending…" : timeAgo(comment.createdAt)}</span>
              {editedAt && <span className="text-tertiary">(edited)</span>}
              {shared && <span className="text-success">Link copied</span>}
            </div>

            {collapsed ? (
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="mt-1.5 inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-2.5 py-0.5 text-caption text-secondary transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <span>+{totalDescendants + 1} hidden</span>
                <span aria-hidden>·</span>
                <span className="font-medium text-primary">Expand</span>
              </button>
            ) : (
              <>
                {editing ? (
                  <div className="mt-1.5">
                    <CommentComposer
                      autoFocus
                      initialValue={content}
                      submitLabel="Save"
                      allowMedia={false}
                      onCancel={() => setEditing(false)}
                      onSubmit={saveEdit}
                      placeholder="Edit your comment..."
                    />
                  </div>
                ) : (
                  <CommentBody content={content} mediaUrl={comment.mediaUrl ?? null} />
                )}

                <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                  <VoteControl score={score} myVote={myVote} onVote={vote} compact />

                  {reactions.map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      disabled={comment.pending || !onToggleReaction}
                      onClick={() => void onToggleReaction?.(comment.id, r.emoji)}
                      aria-pressed={r.mine}
                      className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-caption tabular-nums transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                        r.mine
                          ? "border-brand/40 bg-brand/15 text-primary"
                          : "border-white/10 bg-white/[0.03] text-secondary hover:border-white/20 hover:text-primary"
                      }`}
                    >
                      <span>{r.emoji}</span>
                      <span>{r.count}</span>
                    </button>
                  ))}

                  {!comment.pending && onToggleReaction && (
                    <ReactionPicker onSelect={(emoji) => void onToggleReaction(comment.id, emoji)} />
                  )}

                  {!comment.pending && !commentsLocked && (
                    <>
                      <button
                        type="button"
                        onClick={() => setReplying((v) => !v)}
                        className="flex items-center gap-1 rounded-control px-2 py-1 text-caption text-tertiary transition-colors hover:bg-white/[0.05] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                      >
                        <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden>
                          <path
                            d="M2.5 4h11a.8.8 0 0 1 .8.8v6a.8.8 0 0 1-.8.8H6.2L3.5 14v-2.4H2.5a.8.8 0 0 1-.8-.8v-6A.8.8 0 0 1 2.5 4Z"
                            stroke="currentColor"
                            strokeWidth="1.3"
                            strokeLinejoin="round"
                          />
                        </svg>
                        Reply
                      </button>
                      <button
                        type="button"
                        onClick={handleQuote}
                        className="rounded-control px-2 py-1 text-caption text-tertiary transition-colors hover:bg-white/[0.05] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                      >
                        Quote
                      </button>
                    </>
                  )}

                  {!atDepthLimit && children.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setCollapsed(true)}
                      className="rounded-control px-2 py-1 text-caption text-tertiary transition-colors hover:bg-white/[0.05] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                    >
                      Collapse ({totalDescendants})
                    </button>
                  )}

                  {!comment.pending && (
                    <CommentOverflowMenu
                      postId={postId}
                      commentId={comment.id}
                      mine={!!comment.mine}
                      canDelete={!!comment.canDelete}
                      canPin={!!comment.canPin && !!onTogglePin}
                      pinned={!!comment.pinned}
                      canAccept={!!comment.canAccept && !!onToggleAccept}
                      accepted={!!comment.accepted}
                      reported={reported}
                      onEdit={() => setEditing(true)}
                      onDeleted={() => onDiscard(comment.id)}
                      onTogglePin={onTogglePin ? () => void onTogglePin(comment.id, !comment.pinned) : undefined}
                      onToggleAccept={onToggleAccept ? () => void onToggleAccept(comment.id, !comment.accepted) : undefined}
                      onShare={onShareComment ? () => void handleShare() : undefined}
                      onStartReport={() => setReporting(true)}
                      onError={setActionError}
                    />
                  )}
                </div>

                {actionError && (
                  <p role="alert" className="mt-1 text-caption text-danger">
                    {actionError}
                  </p>
                )}

                {reporting && (
                  <div className="mt-2">
                    <CommentComposer
                      autoFocus
                      submitLabel="Report"
                      allowMedia={false}
                      onCancel={() => setReporting(false)}
                      onSubmit={submitReport}
                      placeholder="What's wrong with it? Only moderators see this."
                    />
                  </div>
                )}
              </>
            )}
          </div>
        </div>

        {replying && !commentsLocked && !collapsed && (
          <div className="ml-9 mt-2">
            <CommentComposer
              autoFocus
              draftKey={`reply:${postId}:${comment.id}`}
              quoteText={quoteText}
              onQuoteConsumed={() => setQuoteText(null)}
              onCancel={() => setReplying(false)}
              onSubmit={async (replyContent, replyMediaUrl) => {
                const ok = await onReply(replyContent, comment.id, replyMediaUrl);
                if (ok) setReplying(false);
                return ok;
              }}
              placeholder={`Reply to ${comment.authorName}...`}
            />
          </div>
        )}
      </div>

      {/* Past the depth limit the subtree stops rendering entirely and offers one link instead. In
          the drawer (no onOpenConversation) there's nowhere to escalate to, so it keeps rendering
          flat at the limit rather than dead-ending the reader. */}
      {!collapsed && atDepthLimit && hiddenCount > 0 && onOpenConversation && (
        <button
          type="button"
          onClick={() => onOpenConversation(comment.id)}
          className="ml-9 mt-1.5 rounded-control text-caption font-medium text-secondary underline-offset-2 transition-colors hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
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
              onTogglePin={onTogglePin}
              onToggleAccept={onToggleAccept}
              onToggleReaction={onToggleReaction}
              commentsLocked={commentsLocked}
              onShareComment={onShareComment}
              highlightedCommentId={highlightedCommentId}
              onOpenConversation={onOpenConversation}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/** Rich comment body: renders `> ` blockquotes, safe links, `@mentions`, Show more/less truncation, and attached media. */
function CommentBody({ content, mediaUrl }: { content: string; mediaUrl: string | null }) {
  const [expanded, setExpanded] = useState(false);
  const isLong = content.length > COMMENT_TRUNCATE_AT;
  const shown = isLong && !expanded ? `${content.slice(0, COMMENT_TRUNCATE_AT).trimEnd()}…` : content;

  const blocks = shown ? splitQuoteBlocks(shown) : [];

  return (
    <div className="mt-1 space-y-1.5">
      {blocks.map((block, index) =>
        block.type === "quote" ? (
          <blockquote
            key={index}
            className="rounded-r-control border-l-2 border-white/25 bg-white/[0.03] px-2.5 py-1 text-caption leading-relaxed text-secondary"
          >
            {renderRichTokens(block.text)}
          </blockquote>
        ) : (
          <p key={index} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-body-sm leading-relaxed text-secondary">
            {renderRichTokens(block.text)}
          </p>
        ),
      )}
      {isLong && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="rounded-control text-caption font-medium text-secondary transition-colors hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          {expanded ? "Show less" : "Show more"}
        </button>
      )}
      {mediaUrl && (
        <div className="mt-1.5 overflow-hidden rounded-card border border-white/10 bg-surface-1 max-w-xs">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl} alt="Comment attachment" loading="lazy" className="max-h-60 w-full object-contain" />
        </div>
      )}
    </div>
  );
}

function splitQuoteBlocks(text: string): { type: "quote" | "text"; text: string }[] {
  const lines = text.split("\n");
  const out: { type: "quote" | "text"; text: string }[] = [];
  for (const line of lines) {
    const trimmed = line.trimStart();
    if (trimmed.startsWith(">")) {
      const clean = trimmed.replace(/^>\s?/, "");
      const last = out[out.length - 1];
      if (last?.type === "quote") last.text += `\n${clean}`;
      else out.push({ type: "quote", text: clean });
    } else {
      const last = out[out.length - 1];
      if (last?.type === "text") last.text += `\n${line}`;
      else if (line.trim() || out.length > 0) out.push({ type: "text", text: line });
    }
  }
  return out;
}

function renderRichTokens(text: string) {
  return text.split(TOKEN_PATTERN).map((part, i) => {
    if (i % 2 === 0) return <Fragment key={i}>{part}</Fragment>;
    if (part.startsWith("@")) {
      return (
        <span key={i} className="font-medium text-brand-text">
          {part}
        </span>
      );
    }
    const trimmed = part.replace(/[.,;:!?)\]}]+$/, "");
    const trailing = part.slice(trimmed.length);
    if (!safeHttpUrl(trimmed)) return <Fragment key={i}>{part}</Fragment>;
    return (
      <Fragment key={i}>
        <a href={trimmed} target="_blank" rel="noopener noreferrer" className="text-brand-text underline-offset-2 hover:underline">
          {trimmed}
        </a>
        {trailing}
      </Fragment>
    );
  });
}

function ReactionPicker({ onSelect }: { onSelect: (emoji: CommentReactionEmoji) => void }) {
  return (
    <Popover
      ariaLabel="Add reaction"
      panelClassName="!min-w-0 p-1"
      trigger={({ open, toggle, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label="React to comment"
          title="React"
          className="inline-flex h-6 items-center justify-center rounded-full border border-white/10 bg-white/[0.02] px-2 text-caption text-tertiary transition-colors hover:border-white/20 hover:bg-white/[0.06] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          +
        </button>
      )}
    >
      {({ close }) => (
        <div className="flex items-center gap-1">
          {COMMENT_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              onClick={() => {
                onSelect(emoji);
                close();
              }}
              aria-label={`React with ${emoji}`}
              className="flex size-8 items-center justify-center rounded-control text-body-sm transition-colors hover:bg-white/[0.08] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            >
              {emoji}
            </button>
          ))}
        </div>
      )}
    </Popover>
  );
}

const MENU_ITEM =
  "flex w-full items-center gap-2 rounded-control px-2.5 py-1.5 text-left text-caption text-secondary transition-colors hover:bg-white/[0.06] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

function CommentOverflowMenu({
  postId,
  commentId,
  mine,
  canDelete,
  canPin,
  pinned,
  canAccept,
  accepted,
  reported,
  onEdit,
  onDeleted,
  onTogglePin,
  onToggleAccept,
  onShare,
  onStartReport,
  onError,
}: {
  postId: string;
  commentId: string;
  mine: boolean;
  canDelete: boolean;
  canPin: boolean;
  pinned: boolean;
  canAccept: boolean;
  accepted: boolean;
  reported: boolean;
  onEdit: () => void;
  onDeleted: () => void;
  onTogglePin?: () => void;
  onToggleAccept?: () => void;
  onShare?: () => void;
  onStartReport: () => void;
  onError: (msg: string) => void;
}) {
  const [busy, setBusy] = useState(false);

  async function remove(close: () => void) {
    setBusy(true);
    onError("");
    const res = await fetch(`/api/posts/${postId}/comments/${commentId}`, { method: "DELETE" }).catch(() => null);
    setBusy(false);
    close();
    if (res?.ok) onDeleted();
    else onError("Couldn't delete it.");
  }

  return (
    <Popover
      align="end"
      ariaLabel="Comment actions"
      panelClassName="!min-w-44 p-1"
      trigger={({ open, toggle, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label="More comment actions"
          className="flex h-6 items-center justify-center rounded-control px-1.5 text-caption text-tertiary transition-colors hover:bg-white/[0.06] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          ⋯
        </button>
      )}
    >
      {({ close }) => (
        <div className="flex flex-col gap-0.5">
          {canPin && onTogglePin && (
            <button
              type="button"
              onClick={() => {
                onTogglePin();
                close();
              }}
              className={MENU_ITEM}
            >
              {pinned ? "Unpin comment" : "Pin to top"}
            </button>
          )}
          {canAccept && onToggleAccept && (
            <button
              type="button"
              onClick={() => {
                onToggleAccept();
                close();
              }}
              className={MENU_ITEM}
            >
              {accepted ? "Unmark answer" : "Mark as answer"}
            </button>
          )}
          {onShare && (
            <button
              type="button"
              onClick={() => {
                onShare();
                close();
              }}
              className={MENU_ITEM}
            >
              Copy link
            </button>
          )}
          {mine && (
            <button
              type="button"
              onClick={() => {
                onEdit();
                close();
              }}
              className={MENU_ITEM}
            >
              Edit comment
            </button>
          )}
          {canDelete && (
            <ConfirmButton
              onConfirm={() => void remove(close)}
              question={mine ? "Delete?" : "Remove?"}
              confirmLabel={mine ? "Delete" : "Remove"}
              pending={busy}
              className={`${MENU_ITEM} text-danger hover:text-danger`}
            >
              {mine ? "Delete comment" : "Remove comment"}
            </ConfirmButton>
          )}
          {!mine &&
            (reported ? (
              <span className="px-2.5 py-1.5 text-caption text-tertiary">Reported</span>
            ) : (
              <button
                type="button"
                onClick={() => {
                  onStartReport();
                  close();
                }}
                className={MENU_ITEM}
              >
                Report comment
              </button>
            ))}
        </div>
      )}
    </Popover>
  );
}

/** Replies sit under their parent's avatar column, with a hairline rule marking the thread - enough
 * to read as nested without marching right until the text is one word wide. */
function indent(depth: number): string {
  return depth > 0 ? "ml-9 border-l border-white/10 pl-3" : "";
}

const SORT_LABELS: Record<CommentSort, string> = {
  top: "Top",
  newest: "Newest",
  oldest: "Oldest",
};

export function CommentSortControl({ value, onChange }: { value: CommentSort; onChange: (sort: CommentSort) => void }) {
  return (
    <div className="flex items-center gap-1" role="group" aria-label="Sort comments">
      {(["top", "newest", "oldest"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`rounded-full px-2.5 py-0.5 text-caption font-medium transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
            value === option ? "bg-white/[0.08] text-primary" : "text-tertiary hover:text-secondary"
          }`}
        >
          {SORT_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
