import type { ReactNode } from "react";
import { MessageSquare, Share2 } from "lucide-react";
import { Icon } from "@/components/ui/Icon";
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
/** Ghost actions (critique §5.1): 36px targets, no borders or fills at rest, a neutral tone on hover. */
const ACTION =
  "flex h-8 items-center gap-1.5 rounded-full px-2.5 text-caption text-tertiary transition-colors duration-fast hover:bg-surface-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring";

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
    <div className="-ml-2 mt-2 flex items-center gap-1">
      <VoteControl score={score} myVote={myVote} onVote={onVote} compact />
      <button type="button" onClick={onOpenComments} aria-label={`Open discussion, ${commentCount} comment${commentCount === 1 ? "" : "s"}`} className={ACTION}>
        <Icon icon={MessageSquare} size={16} />
        <span className="tabular">{commentCount === 0 ? "Reply" : commentCount}</span>
      </button>
      {onShare && (
        <button type="button" onClick={onShare} className={ACTION}>
          <Icon icon={Share2} size={16} />
          {shareLabel ?? "Share"}
        </button>
      )}
      {trailing && <div className="ml-auto min-w-0">{trailing}</div>}
    </div>
  );
}
