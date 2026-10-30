"use client";

import { PersonAvatar } from "@/components/avatar/PersonAvatar";
import { Fragment, useState } from "react";
import { MessageSquare, MoreHorizontal, Quote, SmilePlus } from "lucide-react";
import { useAuth } from "@/providers/AuthProvider";
import { timeAgo } from "@/lib/format";
import { safeHttpUrl } from "@/lib/linkPreview";
import { COMMENT_REACTIONS, type CommentReactionEmoji } from "@/lib/communities";
import { Badge } from "@/components/ui/Badge";
import { ConfirmButton } from "@/components/ui/ConfirmButton";
import { Icon } from "@/components/ui/Icon";
import { Popover } from "@/components/ui/Popover";
import { MENU_ITEM } from "@/components/ui/panel";
import { CommentComposer } from "./CommentComposer";
import { useOptimisticVote } from "./useOptimisticVote";
import { VoteControl } from "./VoteControl";
import { countDescendants, type CommentSort, type LocalComment } from "./useComments";
import { AuthorProfilePopover } from "./AuthorProfilePopover";

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
    <div className="space-y-4">
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

  const isMe = Boolean(user && (comment.mine || (Boolean(comment.userId) && user.uid === comment.userId)));
  const avatar = isMe ? (myAvatar ?? comment.authorAvatar ?? null) : (comment.authorAvatar ?? null);

  const children = childrenOf.get(comment.id) ?? [];
  const totalDescendants = countDescendants(comment.id, childrenOf);
  const atDepthLimit = depth >= MAX_VISIBLE_DEPTH;
  const hiddenCount = atDepthLimit ? totalDescendants : 0;
  const isHighlighted = Boolean(highlightedCommentId && highlightedCommentId === comment.id);
  const reactions = comment.reactions ?? [];
  const nestChildrenInline = !collapsed && children.length > 0 && !atDepthLimit;
  const flattenChildrenBelow = !collapsed && children.length > 0 && atDepthLimit && !onOpenConversation;
  const showSpine = !collapsed && (nestChildrenInline || replying);

  if (comment.failed) {
    return (
      <div className="rounded-lg border border-brand/40 bg-brand/5 px-3 py-2.5">
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
    );
  }

  const cardSurface = comment.accepted
    ? "rounded-lg border border-success/30 bg-success/[0.04] p-3"
    : comment.pinned
      ? "rounded-lg border border-warning/25 bg-warning/[0.03] p-3"
      : isHighlighted
        ? "rounded-lg border border-brand/35 bg-brand/[0.04] p-3"
        : "";

  const childNodes = children.map((child) => (
    <CommentNode
      key={child.id}
      comment={child}
      childrenOf={childrenOf}
      postId={postId}
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
  ));

  return (
    <div>
      <div className={cardSurface}>
        <div className={`flex gap-3 ${comment.pending ? "opacity-60" : ""}`}>
          <div className="flex w-7 shrink-0 flex-col items-center">
            <AuthorProfilePopover
              userId={comment.userId}
              authorName={comment.authorName}
              authorAvatar={avatar}
              authorRole={comment.authorRole}
            >
              {({ ref, toggle, open }) => (
                <button
                  ref={ref as (node: HTMLButtonElement | null) => void}
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    toggle();
                  }}
                  aria-expanded={open}
                  aria-label={`About ${comment.authorName}`}
                  className="rounded-full transition-opacity duration-fast hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                >
                  <PersonAvatar id={comment.userId || (isMe ? (user?.uid ?? "") : "") || comment.authorName} avatar={avatar} size={28} />
                </button>
              )}
            </AuthorProfilePopover>
            {showSpine && (
              <button
                type="button"
                onClick={() => setCollapsed(true)}
                aria-label={`Collapse thread by ${comment.authorName}`}
                title="Collapse thread"
                className="group/spine mt-2 flex w-5 flex-1 justify-center rounded-control focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <span className="h-full w-px bg-white/[0.08] transition-colors duration-fast group-hover/spine:w-0.5 group-hover/spine:bg-white/30" />
              </button>
            )}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1 text-body-sm leading-5">
              <AuthorProfilePopover
                userId={comment.userId}
                authorName={comment.authorName}
                authorAvatar={avatar}
                authorRole={comment.authorRole}
              >
                {({ ref, toggle, open }) => (
                  <button
                    ref={ref as (node: HTMLButtonElement | null) => void}
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      toggle();
                    }}
                    aria-expanded={open}
                    className="rounded-control font-semibold text-primary transition-colors hover:text-brand-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    {comment.authorName}
                  </button>
                )}
              </AuthorProfilePopover>
              {comment.isOp && <Badge tone="info">OP</Badge>}
              {comment.authorRole === "admin" && <Badge tone="neutral">Admin</Badge>}
              {comment.authorRole === "moderator" && <Badge tone="neutral">Mod</Badge>}
              {comment.accepted && <Badge tone="success">✓ Answered</Badge>}
              {comment.pinned && <Badge tone="warning">Pinned</Badge>}
              {depth >= MAX_VISIBLE_DEPTH && comment.parentAuthorName && (
                <span className="rounded-control bg-surface-2 px-1.5 py-0.5 text-caption text-tertiary">
                  ↳ @{comment.parentAuthorName}
                </span>
              )}
              <span aria-hidden className="text-tertiary">
                ·
              </span>
              <span className="text-caption text-tertiary">{comment.pending ? "Sending…" : timeAgo(comment.createdAt)}</span>
              {editedAt && <span className="text-caption text-tertiary">(edited)</span>}
              {shared && <span className="text-caption text-success">Link copied</span>}
            </div>

            {collapsed ? (
              <button
                type="button"
                onClick={() => setCollapsed(false)}
                className="mt-1.5 inline-flex items-center gap-1.5 rounded-control border border-white/[0.08] bg-white/[0.02] px-2.5 py-1 text-caption text-secondary transition-colors duration-fast hover:border-white/[0.16] hover:bg-white/[0.05] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
              >
                <span>+{totalDescendants + 1} hidden</span>
                <span aria-hidden>·</span>
                <span className="font-medium text-primary">Expand</span>
              </button>
            ) : (
              <>
                {editing ? (
                  <div className="mt-2">
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

                <div className="-ml-1.5 mt-1 flex flex-wrap items-center gap-1">
                  <VoteControl score={score} myVote={myVote} onVote={vote} compact />

                  {reactions.map((r) => (
                    <button
                      key={r.emoji}
                      type="button"
                      disabled={comment.pending || !onToggleReaction}
                      onClick={() => void onToggleReaction?.(comment.id, r.emoji)}
                      aria-pressed={r.mine}
                      className={`inline-flex h-7 items-center gap-1 rounded-control border px-2 text-caption tabular-nums transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                        r.mine
                          ? "border-brand/40 bg-brand/15 text-primary"
                          : "border-white/[0.08] bg-white/[0.02] text-secondary hover:border-white/[0.16] hover:text-primary"
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
                        aria-pressed={replying}
                        className={`flex h-7 items-center gap-1.5 rounded-control px-2 text-caption transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
                          replying ? "bg-surface-2 text-primary" : "text-tertiary hover:bg-surface-2 hover:text-primary"
                        }`}
                      >
                        <Icon icon={MessageSquare} size={16} className="size-3.5" />
                        Reply
                      </button>
                      <button
                        type="button"
                        onClick={handleQuote}
                        className="flex h-7 items-center gap-1 rounded-control px-2 text-caption text-tertiary transition-colors duration-fast hover:bg-surface-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                      >
                        <Icon icon={Quote} size={16} className="size-3" />
                        Quote
                      </button>
                    </>
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
                      hasReplies={children.length > 0}
                      replyCount={totalDescendants}
                      reported={reported}
                      onEdit={() => setEditing(true)}
                      onDeleted={() => onDiscard(comment.id)}
                      onCollapse={() => setCollapsed(true)}
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
                  <div className="mt-2.5">
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

                {replying && !commentsLocked && (
                  <div className="mt-2.5">
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

                {atDepthLimit && hiddenCount > 0 && onOpenConversation && (
                  <button
                    type="button"
                    onClick={() => onOpenConversation(comment.id)}
                    className="mt-2 inline-flex items-center gap-1 rounded-control px-2 py-1 text-caption font-medium text-secondary transition-colors duration-fast hover:bg-surface-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
                  >
                    View conversation ({hiddenCount} more)
                  </button>
                )}

                {nestChildrenInline && <div className="mt-3.5 space-y-3.5">{childNodes}</div>}
              </>
            )}
          </div>
        </div>
      </div>

      {flattenChildrenBelow && <div className="mt-3.5 space-y-3.5">{childNodes}</div>}
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
            className="rounded-r-control border-l-2 border-white/25 bg-white/[0.03] px-2.5 py-1.5 text-caption leading-relaxed text-secondary"
          >
            {renderRichTokens(block.text)}
          </blockquote>
        ) : (
          <p key={index} className="whitespace-pre-wrap break-words [overflow-wrap:anywhere] text-body-sm leading-6 text-primary/90">
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
        <div className="mt-2 max-w-xs overflow-hidden rounded-lg border border-white/10 bg-surface-1">
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
          className={`flex size-7 items-center justify-center rounded-control transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
            open ? "bg-surface-2 text-primary" : "text-tertiary hover:bg-surface-2 hover:text-primary"
          }`}
        >
          <Icon icon={SmilePlus} size={16} className="size-3.5" />
        </button>
      )}
    >
      {({ close }) => (
        <div className="flex items-center gap-0.5">
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

function CommentOverflowMenu({
  postId,
  commentId,
  mine,
  canDelete,
  canPin,
  pinned,
  canAccept,
  accepted,
  hasReplies,
  replyCount,
  reported,
  onEdit,
  onDeleted,
  onCollapse,
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
  hasReplies: boolean;
  replyCount: number;
  reported: boolean;
  onEdit: () => void;
  onDeleted: () => void;
  onCollapse: () => void;
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
      panelClassName="!min-w-44 p-1.5"
      trigger={({ open, toggle, ref }) => (
        <button
          ref={ref}
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-label="More comment actions"
          className={`flex size-7 items-center justify-center rounded-control transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
            open ? "bg-surface-2 text-primary" : "text-tertiary hover:bg-surface-2 hover:text-primary"
          }`}
        >
          <Icon icon={MoreHorizontal} size={16} className="size-3.5" />
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
          {hasReplies && (
            <button
              type="button"
              onClick={() => {
                onCollapse();
                close();
              }}
              className={MENU_ITEM}
            >
              Collapse thread ({replyCount})
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
              <span className="px-2.5 py-2 text-body-sm text-tertiary">Reported</span>
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

const SORT_LABELS: Record<CommentSort, string> = {
  top: "Top",
  newest: "Newest",
  oldest: "Oldest",
};

export function CommentSortControl({ value, onChange }: { value: CommentSort; onChange: (sort: CommentSort) => void }) {
  return (
    <div className="inline-flex items-center gap-0.5 rounded-control border border-white/[0.06] bg-white/[0.02] p-0.5" role="group" aria-label="Sort comments">
      {(["top", "newest", "oldest"] as const).map((option) => (
        <button
          key={option}
          type="button"
          aria-pressed={value === option}
          onClick={() => onChange(option)}
          className={`rounded-control px-2 py-1 text-caption transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
            value === option ? "bg-white/[0.08] font-medium text-primary" : "text-tertiary hover:text-secondary"
          }`}
        >
          {SORT_LABELS[option]}
        </button>
      ))}
    </div>
  );
}
