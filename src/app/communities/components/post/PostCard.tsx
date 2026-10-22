"use client";

import { MENU_ITEM } from "@/components/ui/panel";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Icon } from "@/components/ui/Icon";
import { Popover } from "@/components/ui/Popover";
import { POST_KIND_LABELS } from "@/lib/communities";
import { PostActionBar } from "./PostActionBar";
import { PostContent } from "./PostContent";
import { PostDetailWindow } from "./PostDetailWindow";
import { PostAvatar, PostByline } from "./PostHeader";
import { PostMedia } from "./PostMedia";
import { PostAttachment } from "./PostAttachment";
import type { PostCardData } from "./types";
import { useOptimisticVote } from "./useOptimisticVote";
import { PANEL_INTERACTIVE } from "../panel";
import { CallChip } from "./CallChip";
import type { SessionPhase } from "@/lib/communityWeekend";
import { groupHref } from "@/lib/routes";

const ROLE_LABEL: Record<string, string> = { admin: "Admin", moderator: "Moderator" };

/**
 * The one post card every surface in Groups renders - the home feed, a community's own Feed tab,
 * and the discussion window's own header all build from these same pieces rather than three
 * parallel implementations. `showGroup` is the only real behavioural difference: the cross-
 * community home feed leads with the community, a community's own feed leads with the author (see
 * PostHeader).
 *
 * `variant`: the default is a card in the site's glass panel; `"compact"` (the homepage's activity strip) is a
 * smaller divider-separated row.
 */
export function PostCard({
  post,
  index = 0,
  showGroup,
  canModerate = false,
  onModerated,
  variant = "default",
  sessionTag,
}: {
  post: PostCardData;
  index?: number;
  showGroup: boolean;
  canModerate?: boolean;
  onModerated?: (action: "approve" | "reject") => void;
  variant?: "default" | "compact";
  /** Where in the race weekend it was written (Communities' weekend mode). */
  sessionTag?: SessionPhase;
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
    if (!post.groupId) return;
    const url = `${window.location.origin}${groupHref(post.groupId)}&post=${post.id}`;
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

  const [confirmRemove, setConfirmRemove] = useState(false);
  const [moderating, setModerating] = useState(false);
  const [moderateError, setModerateError] = useState("");

  /** Only a decision the server took changes the feed; a failure is said, in the menu, and nothing moves. */
  async function moderate(action: "approve" | "reject", close: () => void) {
    if (!post.groupId) return;
    setModerating(true);
    setModerateError("");
    const res = await fetch(`/api/groups/${post.groupId}/posts/${post.id}/moderate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    }).catch(() => null);
    setModerating(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setModerateError(body?.error ?? "Couldn't do that. Check your connection and try again.");
      return;
    }
    close();
    setConfirmRemove(false);
    onModerated?.(action);
  }

  // The whole card opens the discussion, as on any social feed - except a click that was really meant for something
  // inside it (a link, a button, the vote control, a video, a menu) or that ends a text selection.
  function openFromCard(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, textarea, select, video, audio, [role='menu'], [role='dialog'], [data-no-open]")) return;
    if (typeof window !== "undefined" && window.getSelection()?.toString()) return;
    setDetailOpen(true);
  }

  const menu =
    canModerate && post.groupId ? (
      <Popover
        align="end"
        ariaLabel="Post actions"
        panelClassName="w-44"
        trigger={({ open, toggle, ref }) => (
          <button
            ref={ref}
            type="button"
            onClick={() => {
              setConfirmRemove(false);
              setModerateError("");
              toggle();
            }}
            aria-expanded={open}
            aria-label="Post actions"
            className={`-mr-1.5 -mt-1 flex size-8 shrink-0 items-center justify-center rounded-control transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${open ? "bg-surface-3 text-primary" : "text-tertiary hover:bg-surface-2 hover:text-primary"}`}
          >
            <Icon icon={MoreHorizontal} size={16} />
          </button>
        )}
      >
        {({ close }) =>
          confirmRemove ? (
            <div className="p-3.5">
              <p className="text-body-sm font-medium text-primary">Remove this post?</p>
              <p className="mt-1 text-caption text-tertiary">It disappears from the feed for everyone.</p>
              <div className="mt-3 flex gap-2">
                <Button variant="danger" size="sm" loading={moderating} onClick={() => void moderate("reject", close)}>
                  Remove
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setConfirmRemove(false)}>
                  Keep
                </Button>
              </div>
              {moderateError && <p role="alert" className="mt-2 text-caption text-danger">{moderateError}</p>}
            </div>
          ) : (
            <div className="p-1.5">
              {status === "pending" && (
                <button type="button" disabled={moderating} onClick={() => void moderate("approve", close)} className={MENU_ITEM}>
                  {moderating ? "Approving…" : "Approve post"}
                </button>
              )}
              <button type="button" onClick={() => setConfirmRemove(true)} className={`${MENU_ITEM} hover:text-danger`}>
                Remove post
              </button>
              {moderateError && <p role="alert" className="px-2.5 pb-1 text-caption text-danger">{moderateError}</p>}
            </div>
          )
        }
      </Popover>
    ) : null;

  return (
    <article
      /* Only the first card is a tour target - the tour needs one real post to point at. */
      data-tour={index === 0 ? "post" : undefined}
      onClick={variant === "compact" ? undefined : openFromCard}
      className={
        variant === "compact"
          ? "border-b border-white/10 py-3 last:border-b-0"
          : // A card in the site's own glass (the same panel as prediction rounds and Season's sections); the edge lifts
            // on hover to say the card opens.
            `cursor-pointer p-4 ${PANEL_INTERACTIVE}`
      }
    >
      {/* The avatar in a column of its own and the post indented beside it, the way a social feed reads. */}
      <div className="flex gap-3">
        <PostAvatar post={post} showGroup={showGroup} size={32} />
        <div className="min-w-0 flex-1">
          <div className="flex items-start gap-2">
            <div className="min-w-0 flex-1">
              <PostByline post={post} showGroup={showGroup} roleLabel={roleLabel} pending={status === "pending"} sessionTag={sessionTag} />
            </div>
            {menu}
          </div>

          <div className="mt-1">
            <PostContent title={post.title} content={post.content} />
            {/* PostAttachment whenever the post carries real metadata; PostMedia remains the path for
                rows uploaded before it existed, which have a URL and nothing else. */}
            {post.attachment ? <PostAttachment attachment={post.attachment} /> : post.mediaUrl ? <PostMedia url={post.mediaUrl} /> : null}
            {post.call && <CallChip call={post.call} />}
            {kindChip && (
              <Badge tone="neutral" className="mt-2">
                {kindChip}
              </Badge>
            )}
          </div>

          <PostActionBar
            score={score}
            myVote={myVote}
            onVote={vote}
            commentCount={commentCount}
            onOpenComments={() => setDetailOpen(true)}
            onShare={post.groupId ? () => void share() : undefined}
            shareLabel={shareLabel}
          />
        </div>
      </div>

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
    </article>
  );
}
