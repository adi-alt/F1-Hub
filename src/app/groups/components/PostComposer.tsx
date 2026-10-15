"use client";

import { useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { Check, Compass, Crosshair, FaceSlightlySmiling, Image, ImagePlay, X, type LucideIcon } from "lucide-react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { Icon } from "@/components/ui/Icon";
import { useAuth } from "@/providers/AuthProvider";
import { canDo, postKindsFor } from "@/lib/communities";
import { PredictionComposer, type RaceOption } from "./post/PredictionComposer";
import { ComposeAssist } from "./post/ComposeAssist";
import { PostAttachment, type AttachmentView } from "./post/PostAttachment";
import { renderPdfFirstPage } from "./post/pdfThumbnail";
import { SchedulePost } from "./post/SchedulePost";
import type { PostStatus } from "@/lib/supabase/groupPosts";
import { fileNameFromUrl } from "@/lib/mediaKind";
import { CommunitySelector } from "./post/CommunitySelector";
import { EmojiPicker } from "./post/EmojiPicker";
import { GifPicker } from "./post/GifPicker";

const IMAGE_MAX_BYTES = 500 * 1024;
const OTHER_MAX_BYTES = 2 * 1024 * 1024;
// mime -> max bytes for that mime - mirrors /api/posts/media/route.ts's own map exactly (client-
// side pre-check, not the real enforcement - that's still the server + the bucket's own cap).
const MEDIA_MAX_BYTES: Record<string, number> = {
"image/png": IMAGE_MAX_BYTES,
"image/jpeg": IMAGE_MAX_BYTES,
"image/webp": IMAGE_MAX_BYTES,
"image/gif": IMAGE_MAX_BYTES,
"video/mp4": OTHER_MAX_BYTES,
"video/webm": OTHER_MAX_BYTES,
"application/pdf": OTHER_MAX_BYTES,
"application/msword": OTHER_MAX_BYTES,
"application/vnd.openxmlformats-officedocument.wordprocessingml.document": OTHER_MAX_BYTES,
"application/vnd.ms-excel": OTHER_MAX_BYTES,
"application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": OTHER_MAX_BYTES,
};
const FILE_ACCEPT = Object.keys(MEDIA_MAX_BYTES).join(",");

/**
 * The feed's own composer: avatar, one real input, and a row of the attachments/post-type controls
 * underneath it - always visible, not collapsed behind a placeholder row that has to be clicked
 * once before anything appears.
 *
 * Every control in that row does something real. There is deliberately no "Poll" button: no poll
 * table, endpoint or post kind exists anywhere in this app, and a control that opens nothing is
 * worse than one fewer control. "Prediction" is real - it sets the post's `kind`, which createPost
 * re-validates against the target community's own enabled modules server-side - so it only appears
 * when the community you're actually posting to offers it.
 *
 * A community is genuinely optional (CommunitySelector's own "No community" option) - selecting
 * nothing posts a real personal post, not a fake default group. `fixedGroupId` is what a caller
 * passes when the target is already known (the rail has a community selected), which hides the
 * selector rather than showing it pre-filled and disabled.
 */
/** What the composer actually needs to know about a community: enough to name it, to work out
 * which post kinds it offers, and to check the viewer's permissions in it. Structural rather than
 * GroupSummary itself, so a surface that only holds ONE community (a community's own page, which
 * has a GroupDetail and no summary rows at all) can use this composer without assembling a fake
 * GroupSummary around it. Every existing caller passes GroupSummary[], which satisfies this. */
export type ComposerCommunity = {
  id: string;
  name: string;
  description: string | null;
  avatarUrl: string | null;
  communityType: string;
  features: unknown;
  permissions: unknown;
  myRole: string;
};

export function PostComposer({
  groups,
  onPosted,
  fixedGroupId,
  placeholder,
  upcomingRaces = [],
}: {
  groups: ComposerCommunity[];
  onPosted: () => void;
  /** The community this composer always posts to. The selector is replaced by a plain "posting to"
   * chip rather than hidden: on a community's own page the target is never in doubt, but it should
   * still be visible, and offering a dropdown there would invite cross-posting away from the page
   * the person is looking at. */
  fixedGroupId?: string;
  placeholder?: string;
  /** This season's un-finished rounds, for opening a prediction. Empty (the default) simply means
   * no prediction mode is offered - every other caller of this composer passes nothing. */
  upcomingRaces?: RaceOption[];
}) {
  const { user, displayName } = useAuth();
  const [focused, setFocused] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [groupId, setGroupId] = useState(fixedGroupId ?? "");
  const [isPrediction, setIsPrediction] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  // The attachment exactly as it will be stored and rendered - so the composer preview below is
  // the same component, with the same data, that the published post will show.
  const [attachment, setAttachment] = useState<AttachmentView | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [posting, setPosting] = useState(false);
  // "Posted" (or "Scheduled") on the button for a moment after a post goes out, so the send is confirmed where it
  // was made.
  const [justPosted, setJustPosted] = useState<"Posted" | "Scheduled" | null>(null);
  const [notice, setNotice] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [mode, setMode] = useState<"discussion" | "prediction">("discussion");
  // A `datetime-local` value, i.e. wall-clock time in the viewer's own timezone. Converted to a
  // real UTC instant only at submit (new Date(local).toISOString()), which is what makes "7:30 PM"
  // mean 7:30 PM where they are - the server stores and compares instants, never wall clocks.
  const [scheduledAt, setScheduledAt] = useState("");
  const [scheduledConfirmation, setScheduledConfirmation] = useState("");

  // The communities this viewer can genuinely open a round in - their real role in each, against
  // that community's own permission map, through the exact helper createPrediction uses
  // server-side. Not "is signed in", and not "is an admin somewhere": a community that has opened
  // prediction creation up to all members qualifies, and one where they're only a member and it's
  // admins-only does not. When `fixedGroupId` is set (the rail has a community selected) the
  // choice is narrowed to that community, so the composer can't open a round somewhere else.
  const predictionCommunities = groups.filter(
    (g) => (!fixedGroupId || g.id === fixedGroupId) && canDo(g.permissions, "createPredictions", g.myRole),
  );
  const canOpenPrediction = upcomingRaces.length > 0 && predictionCommunities.length > 0;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLTextAreaElement>(null);
  // What the Emoji and GIF panels anchor to: each its own button. They're portaled out of this component (the
  // centre column's scroll container would otherwise clip them), so they measure a real element.
  const gifRef = useRef<HTMLButtonElement>(null);
  const emojiRef = useRef<HTMLButtonElement>(null);

  const targetGroupId = fixedGroupId ?? groupId;
  const targetGroup = targetGroupId ? groups.find((g) => g.id === targetGroupId) : undefined;
  const fixedCommunity = fixedGroupId ? targetGroup : undefined;
  // Real availability, read off that community's own type/features through the same helper the
  // server validates against - not a guess, and never shown for a personal post (createPost forces
  // "discussion" there, since there's no community whose vocabulary it could belong to).
  const canPredict = !!targetGroup && postKindsFor(targetGroup.communityType, targetGroup.features).includes("prediction");
  const isOpen = focused || content.length > 0 || !!mediaPreview;

  // A blob: URL (createObjectURL below) holds its referenced data in memory until explicitly
  // revoked or the document unloads - real, if minor, for a composer someone can attach/remove
  // several files through in one sitting without ever navigating away.
  function releasePreview() {
    if (mediaPreview?.startsWith("blob:")) URL.revokeObjectURL(mediaPreview);
  }

  function reset() {
    releasePreview();
    setFocused(false);
    setTitle("");
    setContent("");
    setGroupId(fixedGroupId ?? "");
    setIsPrediction(false);
    setMediaPreview(null);
    setAttachment(null);
    setMediaUrl(null);
    setMediaError("");
    setNotice("");
    setConfirmDiscard(false);
    setScheduledAt("");
  }

  /** Closing with real work in the box asks first; closing an empty one just closes. Nothing the
   * viewer typed is thrown away on a single stray click. */
  function requestClose() {
    if (title.trim() || content.trim() || mediaPreview) {
      setConfirmDiscard(true);
      return;
    }
    reset();
  }

  async function pickMedia(file: File) {
    setMediaError("");
    const maxBytes = MEDIA_MAX_BYTES[file.type];
    if (!maxBytes) {
      setMediaError("Images, video, audio, PDF, Word, Excel, PowerPoint, text or ZIP files only.");
      return;
    }
    if (file.size > maxBytes) {
      setMediaError(`This file type is limited to ${maxBytes === IMAGE_MAX_BYTES ? "500KB" : "2MB"}.`);
      return;
    }
    releasePreview(); // a file already attached is being replaced - its own blob URL is done for
    const localUrl = URL.createObjectURL(file);
    setMediaPreview(localUrl);
    setMediaUrl(null);
    // Shown immediately from the real File, so the preview names the actual file the moment it is
    // picked rather than after the round trip.
    setAttachment({ url: localUrl, name: file.name, mime: file.type, size: file.size, thumbUrl: null, pages: null });
    setUploadingMedia(true);

    // Rendered before upload so the PNG can travel with it in one request.
    const preview = file.type === "application/pdf" ? await renderPdfFirstPage(file) : null;

    const form = new FormData();
    form.append("media", file);
    if (preview) {
      form.append("thumbnail", new File([preview.thumbnail], "thumb.png", { type: "image/png" }));
      form.append("pages", String(preview.pages));
    }

    const res = await fetch("/api/posts/media", { method: "POST", body: form });
    const body = (await res.json().catch(() => null)) as
      | { mediaUrl?: string; name?: string; mime?: string; size?: number; thumbUrl?: string | null; pages?: number | null; error?: string }
      | null;

    if (res.ok && body?.mediaUrl) {
      setMediaUrl(body.mediaUrl);
      setAttachment({
        url: body.mediaUrl,
        name: body.name ?? file.name,
        mime: body.mime ?? file.type,
        size: body.size ?? file.size,
        thumbUrl: body.thumbUrl ?? null,
        pages: body.pages ?? preview?.pages ?? null,
      });
    } else {
      setMediaError(body?.error ?? "Upload failed.");
      setMediaPreview(null);
      setAttachment(null);
    }
    setUploadingMedia(false);
  }

  function removeMedia() {
    releasePreview();
    setMediaPreview(null);
    setAttachment(null);
    setMediaUrl(null);
    setMediaError("");
  }

  function insertAtCursor(text: string) {
    const el = bodyRef.current;
    if (!el) {
      setContent((prev) => prev + text);
      return;
    }
    const start = el.selectionStart ?? content.length;
    const end = el.selectionEnd ?? content.length;
    setContent(content.slice(0, start) + text + content.slice(end));
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + text.length;
    });
  }

  async function submit() {
    const trimmed = content.trim();
    if (!trimmed || uploadingMedia) return;
    setPosting(true);
    setNotice("");
    const res = await fetch("/api/posts", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        groupId: targetGroupId || null,
        title: title.trim() || undefined,
        content: trimmed,
        mediaUrl,
        attachment: attachment ? { name: attachment.name, mime: attachment.mime, size: attachment.size, thumbUrl: attachment.thumbUrl, pages: attachment.pages } : null,
        kind: isPrediction && canPredict ? "prediction" : undefined,
        scheduledAt: scheduledAt ? new Date(scheduledAt).toISOString() : null,
      }),
    });
    const body = (await res.json().catch(() => null)) as { status?: PostStatus; scheduledAt?: string | null; error?: string } | null;
    if (res.ok) {
      // A scheduled post deliberately does NOT appear in the feed yet, so say where it went -
      // otherwise a successful schedule is indistinguishable from a post that vanished.
      if (body?.status === "scheduled" && body.scheduledAt) {
        setScheduledConfirmation(new Date(body.scheduledAt).toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "numeric", minute: "2-digit" }));
      }
      onPosted();
      reset();
      setJustPosted(body?.status === "scheduled" ? "Scheduled" : "Posted");
      setTimeout(() => setJustPosted(null), 2000);
    } else {
      setNotice(body?.error ?? "Could not post - try again.");
    }
    setPosting(false);
  }

  return (
    // One unit: your photo, a borderless field and the tools under it on a single frosted pane, so they read as one
    // interaction. Focus anywhere inside lights the pane's edge. Idle and open are the same pane; opening adds the
    // title line and grows the field.
    <div className="relative rounded-card px-4 py-3 surface-frost transition-shadow duration-fast focus-within:ring-1 focus-within:ring-white/25">
      {(isOpen || mode === "prediction") && (
        <button
          type="button"
          onClick={mode === "prediction" ? () => setMode("discussion") : requestClose}
          aria-label={mode === "prediction" ? "Cancel prediction round" : "Close composer"}
          title={mode === "prediction" ? "Cancel prediction round" : "Close composer"}
          className="absolute right-2 top-2 z-10 flex size-8 items-center justify-center rounded-full text-tertiary transition-colors duration-fast hover:bg-surface-2 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          <Icon icon={X} size={16} />
        </button>
      )}

      {confirmDiscard && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-control bg-warning/[0.08] px-3 py-2">
          <p className="min-w-0 flex-1 text-caption font-medium text-primary">Discard this draft?</p>
          <button type="button" onClick={() => setConfirmDiscard(false)} className="shrink-0 rounded-control text-caption font-medium text-secondary transition-colors duration-fast hover:text-primary">
            Keep editing
          </button>
          <button type="button" onClick={reset} className="shrink-0 rounded-control text-caption font-semibold text-danger transition-colors duration-fast hover:brightness-125">
            Discard
          </button>
        </div>
      )}

      {mode === "prediction" ? (
        <div className="flex items-start gap-3">
          <EntityAvatar imageUrl={user?.photoURL ?? null} name={displayName ?? "You"} seed={user?.uid} size={36} />
          <div className="min-w-0 flex-1">
            <p className="pr-8 text-body-sm font-semibold text-primary">New prediction round</p>
            <PredictionComposer
              communities={predictionCommunities}
              races={upcomingRaces}
              onCreated={() => {
                setMode("discussion");
                onPosted();
              }}
            />
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3">
            <EntityAvatar imageUrl={user?.photoURL ?? null} name={displayName ?? "You"} seed={user?.uid} size={36} />
            <div className="min-w-0 flex-1 pr-8">
              {isOpen && (
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Title (optional)"
                  maxLength={300}
                  aria-label="Post title"
                  className="block w-full bg-transparent pt-1.5 text-body font-semibold text-primary placeholder:font-normal placeholder:text-tertiary focus:outline-none"
                />
              )}
              <textarea
                ref={bodyRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                onFocus={() => setFocused(true)}
                placeholder={placeholder ?? (displayName ? `What's on your mind, ${displayName.split(" ")[0]}?` : "What's on your mind?")}
                aria-label="Post"
                rows={isOpen ? 3 : 1}
                maxLength={2000}
                // Idle it is one line and clips a long placeholder rather than wrapping it into a second line the row
                // can't show; focused it opens to three rows and wraps normally.
                className={`block w-full resize-none bg-transparent text-body text-primary placeholder:text-tertiary focus:outline-none ${
                  isOpen ? "mt-1 min-h-[4.5rem]" : "cursor-text overflow-hidden text-ellipsis whitespace-nowrap py-1.5"
                }`}
              />
            </div>
          </div>

          {(attachment || mediaError || scheduledConfirmation) && (
            <div className="space-y-2 pl-12 pt-2">
              {attachment && (
                // The SAME component the published post renders, so what is previewed here is literally what will
                // appear in the feed.
                <div className="max-w-full">
                  <PostAttachment attachment={attachment} onRemove={removeMedia} />
                  {uploadingMedia && <p className="mt-1 text-caption text-tertiary">Uploading…</p>}
                </div>
              )}
              {mediaError && <p className="text-caption text-danger">{mediaError}</p>}
              {scheduledConfirmation && (
                <div className="flex flex-wrap items-center gap-2 rounded-control border border-success/25 bg-success/[0.07] px-3 py-2">
                  <p className="min-w-0 flex-1 text-caption text-primary">Scheduled for {scheduledConfirmation}. It won&apos;t appear in the feed until then.</p>
                  <button type="button" onClick={() => setScheduledConfirmation("")} className="shrink-0 rounded-control text-caption font-medium text-secondary transition-colors duration-fast hover:text-primary">
                    Got it
                  </button>
                </div>
              )}
            </div>
          )}

          {/* The toolbar: monochrome tools on the left, where the post goes and the Post button on the right. */}
          <div className="mt-2 flex flex-wrap items-center gap-0.5 pl-10">
            <ToolButton onClick={() => fileInputRef.current?.click()} icon={Image} label="Photo" />
            <ToolButton ref={gifRef} onClick={() => setShowGif((v) => !v)} active={showGif} icon={ImagePlay} label="GIF" />
            <ToolButton ref={emojiRef} onClick={() => setShowEmoji((v) => !v)} active={showEmoji} icon={FaceSlightlySmiling} label="Emoji" />
            <ComposeAssist draft={content} onReplace={setContent} />
            {canPredict && <ToolButton onClick={() => setIsPrediction((v) => !v)} active={isPrediction} icon={Compass} label="Prediction" />}
            {/* A different thing from the tag above: that marks THIS post as prediction talk, this opens a real
                round the community can enter. Only where the viewer holds the permission; the server re-checks. */}
            {canOpenPrediction && <ToolButton onClick={() => setMode("prediction")} icon={Crosshair} label="New round" />}

            <input
              ref={fileInputRef}
              type="file"
              accept={FILE_ACCEPT}
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void pickMedia(file);
              }}
            />

            <div className="ml-auto flex items-center gap-2">
              {notice && <span role="alert" className="text-caption text-danger">{notice}</span>}
              {fixedGroupId
                ? isOpen &&
                  fixedCommunity && (
                    <span className="flex h-8 min-w-0 items-center gap-2 rounded-full bg-surface-2 px-2.5 text-caption text-secondary">
                      <EntityAvatar imageUrl={fixedCommunity.avatarUrl} name={fixedCommunity.name} seed={fixedCommunity.id} size={16} shape="square" />
                      <span className="min-w-0 max-w-[10rem] truncate">{fixedCommunity.name}</span>
                    </span>
                  )
                : isOpen && (
                    <div className="w-44">
                      <CommunitySelector groups={groups} value={groupId} onChange={setGroupId} />
                    </div>
                  )}
              {/* Scheduling lives inside the post control: it's a choice about how this post is published, not
                  something attached to it. The caret only appears when there's a real alternative to offer. */}
              <div className="flex shrink-0 items-stretch overflow-hidden rounded-full">
                <button
                  type="button"
                  onClick={() => void submit()}
                  disabled={posting || uploadingMedia || !content.trim()}
                  aria-busy={posting}
                  title={!content.trim() && !posting ? "Write something to post" : undefined}
                  className={`flex h-8 items-center gap-1.5 px-4 text-body-sm font-semibold transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring disabled:cursor-not-allowed ${
                    justPosted ? "bg-success/15 text-success" : "bg-brand text-white hover:bg-brand-hover disabled:bg-white/[0.08] disabled:text-tertiary"
                  }`}
                >
                  {justPosted && <Icon icon={Check} size={16} />}
                  {posting ? (scheduledAt ? "Scheduling…" : "Posting…") : (justPosted ?? (scheduledAt ? "Schedule" : "Post"))}
                </button>
                {(content.trim() || scheduledAt) && <SchedulePost value={scheduledAt} onChange={setScheduledAt} />}
              </div>
            </div>
          </div>

          {/* Each panel opens from the button that asked for it (popovers.md: point at the element that revealed
              it), portaled out of the scrolling feed so nothing clips it. */}
          <AnimatePresence>
            {showEmoji && <EmojiPicker anchorRef={emojiRef} onSelect={insertAtCursor} onClose={() => setShowEmoji(false)} />}
            {showGif && (
              <GifPicker
                anchorRef={gifRef}
                onSelect={(url) => {
                  setMediaUrl(url);
                  setMediaPreview(url);
                  setAttachment({ url, name: fileNameFromUrl(url), mime: "image/gif", size: null, thumbUrl: null, pages: null });
                  setShowGif(false);
                }}
                onClose={() => setShowGif(false)}
              />
            )}
          </AnimatePresence>
        </>
      )}
    </div>
  );
}

/** A toolbar tool: an icon-only 32px ghost button (quieter than Post), named by its tooltip and accessible label. */
function ToolButton({
  ref,
  onClick,
  icon,
  label,
  active,
}: {
  ref?: React.Ref<HTMLButtonElement>;
  onClick: () => void;
  icon: LucideIcon;
  label: string;
  active?: boolean;
}) {
  return (
    <button
      ref={ref}
      type="button"
      onClick={onClick}
      aria-pressed={active}
      aria-label={label}
      title={label}
      className={`flex size-8 shrink-0 items-center justify-center rounded-full transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
        active ? "bg-white/[0.1] text-primary" : "text-tertiary hover:bg-white/[0.07] hover:text-primary"
      }`}
    >
      <Icon icon={icon} size={20} />
    </button>
  );
}
