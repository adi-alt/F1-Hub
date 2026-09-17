import { VoteControl } from "./VoteControl";
import type { VoteValue } from "@/lib/supabase/groupPosts";

/** Vote + comment toggle only - not Share/Save/Report/More the spec's own mock lists. Share needs
 * a permalink page (explicitly secondary, not built this pass); Save needs a whole bookmarks
 * table; Report needs a moderation-queue destination beyond what group moderation already covers.
 * Adding those buttons now would just be dead UI - the same "no fake interaction" principle this
 * app has followed everywhere else.
 *
 * Both controls sit inside their own quiet, pill-shaped cluster (a subtle bg + border, not a bare
 * icon floating in whitespace) - two related but distinct interaction groups reading as one
 * intentional row rather than a loose scatter of tiny controls. */
export function PostActionBar({
  score,
  myVote,
  onVote,
  commentCount,
  onOpenComments,
}: {
  score: number;
  myVote: VoteValue;
  onVote: (direction: 1 | -1) => void;
  commentCount: number;
  /** Opens the post's own floating discussion window - the comment button is a real navigation
   * action now, not an inline expand/collapse toggle, so this reports "open", not "toggle". */
  onOpenComments: () => void;
}) {
  return (
    <div className="mt-3 flex items-center gap-2">
      <div className="rounded-full border border-white/[0.08] bg-white/[0.03] px-0.5 py-0.5">
        <VoteControl score={score} myVote={myVote} onVote={onVote} compact />
      </div>
      <button
        type="button"
        onClick={onOpenComments}
        className="flex items-center gap-1.5 rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-neutral-400 transition hover:border-white/20 hover:text-white"
      >
        <svg viewBox="0 0 20 20" width="14" height="14" fill="none" aria-hidden>
          <path d="M3 4.5h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8l-3.5 3v-3H3a1 1 0 0 1-1-1v-8a1 1 0 0 1 1-1Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
        </svg>
        <span className="tabular-nums">{commentCount}</span>
      </button>
    </div>
  );
}
