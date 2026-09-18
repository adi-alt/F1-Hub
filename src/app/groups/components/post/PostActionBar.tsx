import type { ReactNode } from "react";
import { VoteControl } from "./VoteControl";
import type { VoteValue } from "@/lib/supabase/groupPosts";

/**
 * Vote and comments as two compact pill clusters, with room on the right for whatever the caller
 * wants to sit at the end of the row (the post's own kind chip).
 *
 * Still only vote + comments - not Share/Save/Report. Share needs a permalink page, Save needs a
 * bookmarks table, Report needs a moderation destination beyond what group moderation already
 * covers; each would be a button that opens nothing.
 */
export function PostActionBar({
  score,
  myVote,
  onVote,
  commentCount,
  onOpenComments,
  trailing,
}: {
  score: number;
  myVote: VoteValue;
  onVote: (direction: 1 | -1) => void;
  commentCount: number;
  /** Opens the post's own floating discussion window - a real action, not an inline toggle. */
  onOpenComments: () => void;
  trailing?: ReactNode;
}) {
  return (
    <div className="mt-2 flex items-center gap-1.5">
      <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-0.5">
        <VoteControl score={score} myVote={myVote} onVote={onVote} compact />
      </div>
      <button
        type="button"
        onClick={onOpenComments}
        aria-label={`Open discussion, ${commentCount} comment${commentCount === 1 ? "" : "s"}`}
        className="flex h-6 items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-2.5 text-[11px] font-medium text-neutral-400 transition hover:border-white/20 hover:text-white"
      >
        <svg viewBox="0 0 20 20" width="12" height="12" fill="none" aria-hidden>
          <path d="M3 4.5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8l-3.5 3v-3H3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
        <span className="tabular-nums">{commentCount}</span>
      </button>
      {trailing && <div className="ml-auto min-w-0">{trailing}</div>}
    </div>
  );
}
