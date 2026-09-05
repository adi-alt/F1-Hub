import type { VoteValue } from "@/lib/supabase/groupPosts";

/** Compact vertical Reddit-style vote control - arrows either side of the score, not the old
 * "↑ 2" single-button count. Upvote uses F1 HUB's own red accent for its active state (not
 * Reddit's orange) so it still reads as this product; downvote gets a distinct (cool/blue) active
 * state so the two are never confusable at a glance. Purely presentational - onVote just reports
 * which arrow was clicked, the caller (useOptimisticVote) owns the actual state machine. */
export function VoteControl({ score, myVote, onVote, compact = false }: { score: number; myVote: VoteValue; onVote: (direction: 1 | -1) => void; compact?: boolean }) {
  return (
    <div className={compact ? "flex items-center gap-1" : "flex flex-col items-center gap-0.5"}>
      <button
        type="button"
        aria-label="Upvote"
        aria-pressed={myVote === 1}
        onClick={() => onVote(1)}
        className={`flex h-5 w-5 items-center justify-center rounded transition hover:bg-white/[0.06] ${myVote === 1 ? "text-[var(--f1-red)]" : "text-neutral-500 hover:text-neutral-300"}`}
      >
        <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden>
          <path d="M10 4l6 7h-4v5H8v-5H4z" />
        </svg>
      </button>
      <span className="min-w-[1.25rem] text-center text-xs font-semibold tabular-nums text-neutral-300">{score}</span>
      <button
        type="button"
        aria-label="Downvote"
        aria-pressed={myVote === -1}
        onClick={() => onVote(-1)}
        className={`flex h-5 w-5 items-center justify-center rounded transition hover:bg-white/[0.06] ${myVote === -1 ? "text-sky-400" : "text-neutral-500 hover:text-neutral-300"}`}
      >
        <svg viewBox="0 0 20 20" width="14" height="14" fill="currentColor" aria-hidden>
          <path d="M10 16l-6-7h4V4h4v5h4z" />
        </svg>
      </button>
    </div>
  );
}
