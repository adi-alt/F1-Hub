import type { ReactNode } from "react";
import { VoteControl } from "./VoteControl";
import type { VoteValue } from "@/lib/supabase/groupPosts";

/**
 * Vote, comments and share as compact pill clusters, with room on the right for whatever the caller
 * wants to sit at the end of the row (the post's own kind chip).
 *
 * Share exists because there is now a real permalink for it to copy: `/groups/{id}?post={postId}`,
 * which the community page resolves through `GET /api/posts/{postId}` and opens as that post's own
 * discussion window. It is omitted entirely for a post with no community (a personal post has no
 * page to open it on) rather than copying a link to nowhere - which is why `onShare` is optional
 * and not every caller passes it.
 *
 * Still no Save or Report: Save needs a bookmarks table and Report needs a moderation destination
 * beyond what group moderation already covers. Each would be a button that opens nothing.
 */
export function PostActionBar({
  score,
  myVote,
  onVote,
  commentCount,
  onOpenComments,
  onShare,
  shareLabel,
  trailing,
}: {
  score: number;
  myVote: VoteValue;
  onVote: (direction: 1 | -1) => void;
  commentCount: number;
  /** Opens the post's own floating discussion window - a real action, not an inline toggle. */
  onOpenComments: () => void;
  /** Omitted where there is no permalink to share - see the docstring. */
  onShare?: () => void;
  /** "Share", or "Link copied" for the couple of seconds after a successful copy. */
  shareLabel?: string;
  trailing?: ReactNode;
}) {
  return (
    // h-7 controls (28px) rather than the 36px these were: still a comfortable target, but a row of
    // them no longer costs a third of the card's height.
    <div className="mt-2 flex items-center gap-1.5">
      <div className="flex h-7 items-center rounded-full border border-white/[0.08] bg-white/[0.03] px-0.5">
        <VoteControl score={score} myVote={myVote} onVote={onVote} compact />
      </div>
      <button
        type="button"
        onClick={onOpenComments}
        aria-label={`Open discussion, ${commentCount} comment${commentCount === 1 ? "" : "s"}`}
        className="flex h-7 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11px] font-medium text-neutral-400 transition hover:border-white/20 hover:text-white"
      >
        <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden>
          <path d="M3 4.5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8l-3.5 3v-3H3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
        <span className="tabular-nums">{commentCount}</span>
      </button>
      {onShare && (
        <button
          type="button"
          onClick={onShare}
          className="flex h-7 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11px] font-medium text-neutral-400 transition hover:border-white/20 hover:text-white"
        >
          <svg viewBox="0 0 16 16" width="12" height="12" fill="none" aria-hidden>
            <circle cx="12.4" cy="3.6" r="2" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="3.6" cy="8" r="2" stroke="currentColor" strokeWidth="1.3" />
            <circle cx="12.4" cy="12.4" r="2" stroke="currentColor" strokeWidth="1.3" />
            <path d="m5.4 7 5.2-2.6M5.4 9l5.2 2.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
          </svg>
          {shareLabel ?? "Share"}
        </button>
      )}
      {trailing && <div className="ml-auto min-w-0">{trailing}</div>}
    </div>
  );
}
