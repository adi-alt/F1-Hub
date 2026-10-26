"use client";

import { MENU_ITEM } from "@/components/ui/panel";
import { Button } from "@/components/ui/Button";
import { useState } from "react";
import { MoreHorizontal } from "lucide-react";
import { fieldControlClass } from "@/components/ui/Field";
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
import { useOptimisticSave } from "./useOptimisticSave";
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
  onSavedChange,
}: {
  post: PostCardData;
  index?: number;
  showGroup: boolean;
  canModerate?: boolean;
  onModerated?: (action: "approve" | "reject") => void;
  variant?: "default" | "compact";
  /** Where in the race weekend it was written (Communities' weekend mode). */
  sessionTag?: SessionPhase;
  /** Used by the saved-posts page to remove a card as soon as it is unsaved. */
  onSavedChange?: (saved: boolean) => void;
}) {
  const { score, myVote, vote } = useOptimisticVote(`/api/posts/${post.id}/vote`, post.score, post.myVote);
  const { saved, saving, toggle } = useOptimisticSave(`/api/posts/${post.id}/save`, post.saved ?? false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [commentCount, setCommentCount] = useState(post.commentCount);
  const [shareLabel, setShareLabel] = useState("Share");
  const status = post.status ?? "published";
  const roleLabel = post.authorRole && post.authorRole !== "member" ? ROLE_LABEL[post.authorRole] : undefined;
  // "discussion" is the default every post gets when nothing more specific was chosen - chipping
  // it would label every single post with the word "Discussion" for no information gained.
  const kindChip = post.kind && post.kind !== "discussion" ? POST_KIND_LABELS[post.kind] : null;

  async function toggleSaved() {
    const next = await toggle();
    if (next !== null) onSavedChange?.(next);
  }

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

  // What the menu is showing: its actions, or one of the confirmations/forms it opens into.
  const [menuView, setMenuView] = useState<"actions" | "remove" | "delete" | "lock" | "report">("actions");
  const [moderating, setModerating] = useState(false);
  const [moderateError, setModerateError] = useState("");
  const [reportReason, setReportReason] = useState("");
  const [reported, setReported] = useState(false);
  // The author's own edits and deletion, applied here once the server has taken them.
  const [edited, setEdited] = useState<{ title: string | null; content: string; editedAt: string } | null>(null);
  const [editing, setEditing] = useState(false);
  const [gone, setGone] = useState(false);
  const [commentsLocked, setCommentsLocked] = useState(!!post.commentsLocked);
  const view = edited ? { ...post, ...edited } : post;

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
    setMenuView("actions");
    onModerated?.(action);
  }

  /** The author deletes their own post: gone from this feed at once, and for everyone. */
  async function deleteOwn(close: () => void) {
    setModerating(true);
    setModerateError("");
    const res = await fetch(`/api/posts/${post.id}`, { method: "DELETE" }).catch(() => null);
    setModerating(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setModerateError(body?.error ?? "Couldn't delete it. Check your connection and try again.");
      return;
    }
    close();
    setGone(true);
  }

  async function report(close: () => void) {
    setModerating(true);
    setModerateError("");
    const res = await fetch(`/api/posts/${post.id}/report`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ reason: reportReason }),
    }).catch(() => null);
    setModerating(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setModerateError(body?.error ?? "Couldn't send the report. Check your connection and try again.");
      return;
    }
    setReported(true);
    setReportReason("");
    close();
    setMenuView("actions");
  }

  async function toggleCommentsLocked(close: () => void) {
    const next = !commentsLocked;
    setModerating(true);
    setModerateError("");
    const res = await fetch(`/api/posts/${post.id}/comments-lock`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ locked: next }),
    }).catch(() => null);
    setModerating(false);
    if (!res?.ok) {
      const body = (await res?.json().catch(() => null)) as { error?: string } | null;
      setModerateError(body?.error ?? "Couldn't change the discussion lock.");
      return;
    }
    setCommentsLocked(next);
    close();
    setMenuView("actions");
  }

  // The whole card opens the discussion, as on any social feed - except a click that was really meant for something
  // inside it (a link, a button, the vote control, a video, a menu) or that ends a text selection.
  function openFromCard(e: React.MouseEvent) {
    const target = e.target as HTMLElement;
    if (target.closest("a, button, input, textarea, select, video, audio, [role='menu'], [role='dialog'], [data-no-open]")) return;
    if (typeof window !== "undefined" && window.getSelection()?.toString()) return;
    setDetailOpen(true);
  }

  const canReport = !!post.groupId && !post.mine && !reported;
  const menu =
    variant !== "compact" && ((canModerate && post.groupId) || post.mine || canReport) ? (
      <Popover
        align="end"
        ariaLabel="Post actions"
        panelClassName={menuView === "report" ? "w-72" : "w-44"}
        trigger={({ open, toggle, ref }) => (
          <button
            ref={ref}
            type="button"
            onClick={() => {
              setMenuView("actions");
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
          menuView === "remove" || menuView === "delete" || menuView === "lock" ? (
            <div className="p-3.5">
              <p className="text-body-sm font-medium text-primary">
                {menuView === "delete" ? "Delete your post?" : menuView === "lock" ? `${commentsLocked ? "Unlock" : "Lock"} comments?` : "Remove this post?"}
              </p>
              <p className="mt-1 text-caption text-tertiary">
                {menuView === "delete" ? "It and its replies are gone for good." : menuView === "lock" ? (commentsLocked ? "Members can reply again." : "Members will no longer be able to reply.") : "It disappears from the feed for everyone."}
              </p>
              <div className="mt-3 flex gap-2">
                <Button variant={menuView === "lock" && commentsLocked ? "primary" : "danger"} size="sm" loading={moderating} onClick={() => void (menuView === "delete" ? deleteOwn(close) : menuView === "lock" ? toggleCommentsLocked(close) : moderate("reject", close))}>
                  {menuView === "delete" ? "Delete" : menuView === "lock" ? (commentsLocked ? "Unlock" : "Lock") : "Remove"}
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setMenuView("actions")}>
                  Keep
                </Button>
              </div>
              {moderateError && <p role="alert" className="mt-2 text-caption text-danger">{moderateError}</p>}
            </div>
          ) : menuView === "report" ? (
            <div className="p-3.5">
              <label htmlFor={`report-${post.id}`} className="text-body-sm font-medium text-primary">
                What&apos;s wrong with it?
              </label>
              <p className="mt-1 text-caption text-tertiary">Only this community&apos;s moderators see reports.</p>
              <textarea
                id={`report-${post.id}`}
                value={reportReason}
                onChange={(e) => setReportReason(e.target.value)}
                maxLength={500}
                rows={3}
                className={`mt-2 resize-none ${fieldControlClass(false)}`}
              />
              <div className="mt-3 flex gap-2">
                <Button variant="primary" size="sm" loading={moderating} disabled={!reportReason.trim()} onClick={() => void report(close)}>
                  Report
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setMenuView("actions")}>
                  Cancel
                </Button>
              </div>
              {moderateError && <p role="alert" className="mt-2 text-caption text-danger">{moderateError}</p>}
            </div>
          ) : (
            <div className="p-1.5">
              {post.mine && (
                <button
                  type="button"
                  onClick={() => {
                    close();
                    setEditing(true);
                  }}
                  className={MENU_ITEM}
                >
                  Edit post
                </button>
              )}
              {post.mine && (
                <button type="button" onClick={() => setMenuView("delete")} className={`${MENU_ITEM} hover:text-danger`}>
                  Delete post
                </button>
              )}
              {!post.mine && canModerate && post.groupId && status === "pending" && (
                <button type="button" disabled={moderating} onClick={() => void moderate("approve", close)} className={MENU_ITEM}>
                  {moderating ? "Approving…" : "Approve post"}
                </button>
              )}
              {!post.mine && canModerate && post.groupId && (
                <button type="button" onClick={() => setMenuView("remove")} className={`${MENU_ITEM} hover:text-danger`}>
                  Remove post
                </button>
              )}
              {canModerate && post.groupId && status === "published" && (
                <button type="button" onClick={() => setMenuView("lock")} className={MENU_ITEM}>
                  {commentsLocked ? "Unlock comments" : "Lock comments"}
                </button>
              )}
              {canReport && (
                <button type="button" onClick={() => setMenuView("report")} className={MENU_ITEM}>
                  Report
                </button>
              )}
              {moderateError && <p role="alert" className="px-2.5 pb-1 text-caption text-danger">{moderateError}</p>}
            </div>
          )
        }
      </Popover>
    ) : null;

  if (gone) return null;

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
              <PostByline post={view} showGroup={showGroup} roleLabel={roleLabel} pending={status === "pending"} sessionTag={sessionTag} />
            </div>
            {menu}
          </div>

          <div className="mt-1">
            {editing ? (
              <PostEditor
                postId={post.id}
                title={view.title}
                content={view.content}
                onCancel={() => setEditing(false)}
                onSaved={(next) => {
                  setEdited(next);
                  setEditing(false);
                }}
              />
            ) : (
              <PostContent title={view.title} content={view.content} />
            )}
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
            saved={saved}
            onSave={() => void toggleSaved()}
            savePending={saving}
          />
        </div>
      </div>

      {detailOpen && (
        <PostDetailWindow
          post={view}
          score={score}
          myVote={myVote}
          onVote={vote}
          saved={saved}
          onSave={() => void toggleSaved()}
          savePending={saving}
          roleLabel={roleLabel}
          pending={status === "pending"}
          commentsLocked={commentsLocked}
          focusCommentId={null}
          onClose={() => setDetailOpen(false)}
          onCountChange={setCommentCount}
        />
      )}
    </article>
  );
}

/** The author's in-place editor: title and text (the attachment and any call stay as posted). */
function PostEditor({
  postId,
  title,
  content,
  onCancel,
  onSaved,
}: {
  postId: string;
  title: string | null;
  content: string;
  onCancel: () => void;
  onSaved: (next: { title: string | null; content: string; editedAt: string }) => void;
}) {
  const [draftTitle, setDraftTitle] = useState(title ?? "");
  const [draft, setDraft] = useState(content);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function save() {
    setSaving(true);
    setError("");
    const res = await fetch(`/api/posts/${postId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ title: draftTitle, content: draft }),
    }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { editedAt?: string; error?: string } | null;
    setSaving(false);
    if (!res?.ok || !body?.editedAt) {
      setError(body?.error ?? "Couldn't save your edit. Check your connection and try again.");
      return;
    }
    onSaved({ title: draftTitle.trim() || null, content: draft.trim(), editedAt: body.editedAt });
  }

  return (
    <div data-no-open className="space-y-2">
      {title !== null && <input value={draftTitle} onChange={(e) => setDraftTitle(e.target.value)} maxLength={300} aria-label="Title" className={fieldControlClass(false)} />}
      <textarea value={draft} onChange={(e) => setDraft(e.target.value)} maxLength={2000} rows={4} aria-label="Post" autoFocus className={`resize-y ${fieldControlClass(!draft.trim())}`} />
      <div className="flex items-center gap-2">
        <Button variant="primary" size="sm" loading={saving} disabled={!draft.trim()} onClick={() => void save()}>
          Save
        </Button>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          Cancel
        </Button>
        {error && (
          <p role="alert" className="text-caption text-danger">
            {error}
          </p>
        )}
      </div>
    </div>
  );
}
