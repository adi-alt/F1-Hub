import { VoteControl } from "./VoteControl";
import type { VoteValue } from "@/lib/supabase/groupPosts";

/** Vote + comment toggle only - not Share/Save/Report/More the spec's own mock lists. Share needs
 * a permalink page (explicitly secondary, not built this pass); Save needs a whole bookmarks
 * table; Report needs a moderation-queue destination beyond what group moderation already covers.
 * Adding those buttons now would just be dead UI - the same "no fake interaction" principle this
 * app has followed everywhere else. */
export function PostActionBar({
  score,
  myVote,
  onVote,
  commentCount,
  showComments,
  onToggleComments,
}: {
  score: number;
  myVote: VoteValue;
  onVote: (direction: 1 | -1) => void;
  commentCount: number;
  showComments: boolean;
  onToggleComments: () => void;
}) {
  return (
    <div className="mt-2 flex items-center gap-4">
      <VoteControl score={score} myVote={myVote} onVote={onVote} compact />
      <button type="button" onClick={onToggleComments} aria-expanded={showComments} className="flex items-center gap-1.5 text-xs text-neutral-500 transition hover:text-white">
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden>
          <path d="M3 4.5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8l-3.5 3v-3H3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
        {commentCount} comment{commentCount === 1 ? "" : "s"}
      </button>
    </div>
  );
}
