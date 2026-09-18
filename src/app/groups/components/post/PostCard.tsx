"use client";

import { useState } from "react";
import { motion } from "framer-motion";
import { Popover } from "@/components/ui/Popover";
import { POST_KIND_LABELS } from "@/lib/communities";
import { PostActionBar } from "./PostActionBar";
import { PostContent } from "./PostContent";
import { PostDetailWindow } from "./PostDetailWindow";
import { PostHeader } from "./PostHeader";
import { PostMedia } from "./PostMedia";
import type { PostCardData } from "./types";
import { useOptimisticVote } from "./useOptimisticVote";

const ROLE_LABEL: Record<string, string> = { admin: "ADMIN", moderator: "MODERATOR" };

/**
 * The one post card every surface in Groups renders - the home feed, a community's own Feed tab,
 * and the discussion window's own header all build from these same pieces rather than three
 * parallel implementations. `showGroup` is the only real behavioural difference: the cross-
 * community home feed leads with the community, a community's own feed leads with the author (see
 * PostHeader).
 *
 * `variant`: the default is a real frosted card - a post is a discrete thing worth anchoring, and
 * a stream of them needs to read as distinct items, not one undifferentiated column of text.
 * `"compact"` (only `CommunitySection.tsx`, the homepage's activity strip) stays a divider-
 * separated row, which is right for a small preview list.
 */
export function PostCard({
  post,
  index = 0,
  showGroup,
  canModerate = false,
  onModerated,
  variant = "default",
}: {
  post: PostCardData;
  index?: number;
  showGroup: boolean;
  canModerate?: boolean;
  onModerated?: (action: "approve" | "reject") => void;
  variant?: "default" | "compact";
}) {
  const { score, myVote, vote } = useOptimisticVote(`/api/posts/${post.id}/vote`, post.score, post.myVote);
  const [detailOpen, setDetailOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [shareLabel, setShareLabel] = useState("Share");
  const status = post.status ?? "published";
  const roleLabel = post.authorRole && post.authorRole !== "member" ? ROLE_LABEL[post.authorRole] : undefined;
  // "discussion" is the default every post gets when nothing more specific was chosen - chipping
  // it would label every single post with the word "Discussion" for no information gained.
  const kindChip = post.kind && post.kind !== "discussion" ? POST_KIND_LABELS[post.kind] : null;

  /** Copies the post's real permalink. The community page reads `?post=` and opens exactly this
   * post's discussion window - see CommunityFeed. A personal post has no community page to open on,
   * so no Share button is rendered for one at all (the `post.groupId` guard below). */
  async function share() {
    const url = `${window.location.origin}/groups/${post.groupId}?post=${post.id}`;
    try {
      await navigator.clipboard.writeText(url);
      setShareLabel("Link copied");
      setTimeout(() => setShareLabel("Share"), 2000);
    } catch {
      // Clipboard can be blocked (insecure context, denied permission). Showing the URL to select
      // by hand beats a label claiming a copy that didn't happen.
      window.prompt("Copy this post's link:", url);
    }
  }

  async function moderate(action: "approve" | "reject") {
    if (!post.groupId) return;
    await fetch(`/api/groups/${post.groupId}/posts/${post.id}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    onModerated?.(action);
  }

  return (
    <motion.article
      layout
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.25, delay: Math.min(index, 8) * 0.03, ease: "easeOut" }}
      className={
        variant === "compact"
          ? "border-b border-white/[0.06] py-3 last:border-b-0"
          : "rounded-2xl border border-white/[0.07] bg-[var(--f1-carbon)]/60 p-4 backdrop-blur-sm transition hover:border-white/[0.12]"
      }
    >
      <div className="flex items-start gap-2">
        <PostHeader post={post} showGroup={showGroup} roleLabel={roleLabel} pending={status === "pending"} />
        {/* The overflow menu only exists where it has something real to hold - moderation actions
            for someone who can actually moderate. For everyone else there is no menu at all rather
            than a "..." that opens an empty panel. */}
        {canModerate && post.groupId && (
          <Popover
            align="end"
            ariaLabel="Post actions"
            panelClassName="w-44"
            trigger={({ open, toggle, ref }) => (
              <button
                ref={ref}
                type="button"
                onClick={toggle}
                aria-expanded={open}
                aria-label="Post actions"
                className={`-mr-1 -mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition ${open ? "bg-white/[0.08] text-white" : "text-neutral-500 hover:bg-white/[0.06] hover:text-white"}`}
              >
                <svg viewBox="0 0 20 20" width="16" height="16" fill="currentColor" aria-hidden>
                  <circle cx="4" cy="10" r="1.5" />
                  <circle cx="10" cy="10" r="1.5" />
                  <circle cx="16" cy="10" r="1.5" />
                </svg>
              </button>
            )}
          >
            {({ close }) => (
              <div className="p-1">
                {status === "pending" && (
                  <button
                    type="button"
                    onClick={() => {
                      close();
                      void moderate("approve");
                    }}
                    className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-emerald-400 transition hover:bg-emerald-400/10"
                  >
                    Approve post
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    close();
                    void moderate("reject");
                  }}
                  className="w-full rounded-lg px-2.5 py-2 text-left text-sm text-[var(--f1-red)] transition hover:bg-[var(--f1-red)]/10"
                >
                  Remove post
                </button>
              </div>
            )}
          </Popover>
        )}
      </div>

      <div className={variant === "compact" ? "" : "mt-2.5"}>
        <PostContent title={post.title} content={post.content} />
        {post.mediaUrl && <PostMedia url={post.mediaUrl} />}
      </div>

      <PostActionBar
        score={score}
        myVote={myVote}
        onVote={vote}
        commentCount={commentCount}
        onOpenComments={() => setDetailOpen(true)}
        onShare={post.groupId ? () => void share() : undefined}
        shareLabel={shareLabel}
        trailing={
          kindChip ? (
            <span className="block truncate rounded-full border border-white/[0.08] bg-white/[0.03] px-3 py-1.5 text-[11px] font-medium text-neutral-400">{kindChip}</span>
          ) : undefined
        }
      />

      {detailOpen && (
        <PostDetailWindow
          post={post}
          score={score}
          myVote={myVote}
          onVote={vote}
          roleLabel={roleLabel}
          pending={status === "pending"}
          focusCommentId={null}
          onClose={() => setDetailOpen(false)}
          onCountChange={setCommentCount}
        />
      )}
    </motion.article>
  );
}
