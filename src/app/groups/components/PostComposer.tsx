"use client";

import { useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useAuth } from "@/providers/AuthProvider";
import { canDo, postKindsFor } from "@/lib/communities";
import { PredictionComposer, type RaceOption } from "./post/PredictionComposer";
import { ComposeAssist } from "./post/ComposeAssist";
import type { GroupSummary } from "@/lib/supabase/groups";
import { fileNameFromUrl, mediaKind } from "@/lib/mediaKind";
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

/** Human labels for exactly the mime types this composer actually accepts (the map above), so an
 * attachment row reads "Excel spreadsheet · 240 KB" rather than the raw mime string. Falls back to
 * the filename's own extension when the mime is unknown - which is the GIF-picker path, where
 * there's a real URL but no File object to read a type off. */
const MEDIA_LABELS: Record<string, string> = {
  "image/png": "PNG image",
  "image/jpeg": "JPEG image",
  "image/webp": "WebP image",
  "image/gif": "GIF",
  "video/mp4": "MP4 video",
  "video/webm": "WebM video",
  "application/pdf": "PDF",
  "application/msword": "Word document",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "Word document",
  "application/vnd.ms-excel": "Excel spreadsheet",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": "Excel spreadsheet",
};

function describeMedia(mime: string | null, fileName: string | null): string {
  if (mime && MEDIA_LABELS[mime]) return MEDIA_LABELS[mime];
  const ext = fileName?.includes(".") ? fileName.split(".").pop() : null;
  return ext ? ext.toUpperCase() : "File";
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
export function PostComposer({
  groups,
  onPosted,
  fixedGroupId,
  placeholder,
  upcomingRaces = [],
}: {
  groups: GroupSummary[];
  onPosted: () => void;
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
  const [mediaFileName, setMediaFileName] = useState<string | null>(null);
  const [mediaSize, setMediaSize] = useState<number | null>(null);
  const [mediaMime, setMediaMime] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState("");
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [mode, setMode] = useState<"discussion" | "prediction">("discussion");

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

  const targetGroupId = fixedGroupId ?? groupId;
  const targetGroup = targetGroupId ? groups.find((g) => g.id === targetGroupId) : undefined;
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
    setMediaFileName(null);
    setMediaSize(null);
    setMediaMime(null);
    setMediaUrl(null);
    setMediaError("");
    setNotice("");
    setConfirmDiscard(false);
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
      setMediaError("Images, video (MP4/WEBM), PDF, Word, or Excel files only.");
      return;
    }
    if (file.size > maxBytes) {
      setMediaError(`This file type is limited to ${maxBytes === IMAGE_MAX_BYTES ? "500KB" : "2MB"}.`);
      return;
    }
    releasePreview(); // a file already attached is being replaced - its own blob URL is done for
    setMediaPreview(URL.createObjectURL(file));
    setMediaFileName(file.name);
    setMediaSize(file.size);
    setMediaMime(file.type);
    setMediaUrl(null);
    setUploadingMedia(true);
    const form = new FormData();
    form.append("media", file);
    const res = await fetch("/api/posts/media", { method: "POST", body: form });
    const body = (await res.json().catch(() => null)) as { mediaUrl?: string; error?: string } | null;
    if (res.ok && body?.mediaUrl) {
      setMediaUrl(body.mediaUrl);
    } else {
      setMediaError(body?.error ?? "Upload failed.");
      setMediaPreview(null);
    }
    setUploadingMedia(false);
  }

  function removeMedia() {
    releasePreview();
    setMediaPreview(null);
    setMediaFileName(null);
    setMediaSize(null);
    setMediaMime(null);
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
        kind: isPrediction && canPredict ? "prediction" : undefined,
      }),
    });
    const body = (await res.json().catch(() => null)) as { status?: "published" | "pending"; error?: string } | null;
    if (res.ok) {
      onPosted();
      reset();
    } else {
      setNotice(body?.error ?? "Could not post - try again.");
    }
    setPosting(false);
  }

  return (
    <div className="relative rounded-xl border border-white/[0.07] bg-[var(--f1-carbon)]/60 px-3 py-2.5 backdrop-blur-sm">
      {(isOpen || mode === "prediction") && (
        <button
          type="button"
          onClick={mode === "prediction" ? () => setMode("discussion") : requestClose}
          aria-label={mode === "prediction" ? "Cancel prediction round" : "Close composer"}
          title={mode === "prediction" ? "Cancel prediction round" : "Close composer"}
          className="absolute right-2 top-2 z-10 flex h-6 w-6 items-center justify-center rounded-full text-neutral-500 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
        >
          <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" aria-hidden>
            <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
          </svg>
        </button>
      )}

      {confirmDiscard && (
        <div className="mb-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-400/25 bg-amber-400/[0.07] px-2.5 py-1.5">
          <p className="min-w-0 flex-1 text-[11.5px] font-medium text-amber-200/90">Discard this draft?</p>
          <button type="button" onClick={() => setConfirmDiscard(false)} className="shrink-0 text-[11.5px] font-medium text-neutral-300 transition hover:text-white">
            Keep editing
          </button>
          <button type="button" onClick={reset} className="shrink-0 text-[11.5px] font-semibold text-[var(--f1-red)] transition hover:brightness-125">
            Discard
          </button>
        </div>
      )}

      {mode === "prediction" ? (
        <div className="flex items-start gap-2.5">
          <EntityAvatar imageUrl={user?.photoURL ?? null} name={displayName ?? "You"} seed={user?.uid} size={30} />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-semibold uppercase tracking-[0.14em] text-[var(--f1-red)]">New prediction round</p>
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
      <div className="flex items-start gap-2.5">
        <EntityAvatar imageUrl={user?.photoURL ?? null} name={displayName ?? "You"} seed={user?.uid} size={30} />

        <div className="min-w-0 flex-1">
          {isOpen && (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a title (optional)"
              maxLength={300}
              className="mb-1.5 w-full rounded-lg border border-white/[0.07] bg-black/25 py-1.5 pl-3 pr-9 text-[13px] font-semibold text-white placeholder:font-normal placeholder:text-neutral-600 focus:border-white/20 focus:outline-none"
            />
          )}
          <textarea
            ref={bodyRef}
            value={content}
            onChange={(e) => setContent(e.target.value)}
            onFocus={() => setFocused(true)}
            placeholder={placeholder ?? "Share your thoughts with the community..."}
            rows={isOpen ? 3 : 1}
            maxLength={2000}
            className="w-full resize-none rounded-lg border border-white/[0.07] bg-black/25 px-3 py-1.5 text-[13px] leading-relaxed text-white placeholder:text-neutral-500 focus:border-white/20 focus:outline-none"
          />
        </div>
      </div>

      {mediaPreview && (
        // One attachment row for every file type - a real thumbnail where one exists, a typed icon
        // where it doesn't - rather than a bare paperclip next to whatever filename happened to
        // survive. min-w-0 + truncate throughout: a 90-character filename shortens, it never widens
        // the composer or pushes the remove button off the edge.
        <div className="ml-10 mt-2 flex max-w-full items-center gap-2.5 rounded-lg border border-white/[0.07] bg-black/25 p-2">
          {/* Classified by the real filename's extension (mediaFileName), not the blob preview
              URL itself - a blob: URL has no extension to read. */}
          {mediaKind(mediaFileName ?? "") === "image" ? (
            // eslint-disable-next-line @next/next/no-img-element -- blob:/arbitrary Storage URL, not a known-domain asset next/image can optimize
            <img src={mediaPreview} alt="" className="h-10 w-10 shrink-0 rounded border border-white/[0.07] object-cover" />
          ) : mediaKind(mediaFileName ?? "") === "video" ? (
            <video src={mediaPreview} muted playsInline className="h-10 w-10 shrink-0 rounded border border-white/[0.07] bg-black object-cover" />
          ) : (
            <span aria-hidden className="flex h-10 w-10 shrink-0 items-center justify-center rounded border border-white/[0.07] bg-white/[0.04] text-neutral-400">
              <DocumentIcon />
            </span>
          )}

          <span className="min-w-0 flex-1">
            <span className="block truncate text-[12px] font-medium text-neutral-200">{mediaFileName ?? "Attachment"}</span>
            <span className="mt-0.5 block truncate text-[10.5px] text-neutral-500">
              {uploadingMedia ? "Uploading…" : [describeMedia(mediaMime, mediaFileName), mediaSize != null ? formatBytes(mediaSize) : null].filter(Boolean).join(" · ")}
            </span>
          </span>

          <button
            type="button"
            onClick={removeMedia}
            aria-label="Remove attachment"
            title="Remove attachment"
            className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-neutral-500 transition hover:bg-white/[0.08] hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
          >
            <svg viewBox="0 0 20 20" className="h-3 w-3" fill="none" aria-hidden>
              <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
        </div>
      )}
      {mediaError && <p className="ml-10 mt-1 text-[11px] text-[var(--f1-red)]">{mediaError}</p>}

      <div className="relative mt-2 flex flex-wrap items-center gap-x-0.5 gap-y-1.5">
        <ToolButton onClick={() => fileInputRef.current?.click()} icon={<MediaIcon />} label="Add media" />
        <Divider />
        <ToolButton onClick={() => setShowGif((v) => !v)} active={showGif} icon={<GifIcon />} label="GIF" compactLabel />
        <Divider />
        <ToolButton onClick={() => setShowEmoji((v) => !v)} active={showEmoji} icon={<EmojiIcon />} label="Emoji" />
        <Divider />
        <ComposeAssist draft={content} onReplace={setContent} />
        {canPredict && (
          <>
            <Divider />
            <ToolButton onClick={() => setIsPrediction((v) => !v)} active={isPrediction} icon={<PredictionIcon />} label="Prediction" />
          </>
        )}
        {/* A different thing from the chip above it: that tags THIS post as prediction talk, this
            opens a real prediction round the community can enter. Only shown where the viewer
            genuinely holds the permission, and the server re-checks it regardless. */}
        {canOpenPrediction && (
          <>
            <Divider />
            <ToolButton onClick={() => setMode("prediction")} icon={<RoundIcon />} label="New round" />
          </>
        )}

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
          {notice && <span className="text-[11px] text-[var(--f1-red)]">{notice}</span>}
          {!fixedGroupId && isOpen && (
            <div className="w-40">
              <CommunitySelector groups={groups} value={groupId} onChange={setGroupId} />
            </div>
          )}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={posting || uploadingMedia || !content.trim()}
            className="rounded-lg bg-[var(--f1-red)] px-4 py-1.5 text-[12px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
          >
            {posting ? "Posting…" : "Post"}
          </button>
        </div>

        <AnimatePresence>
          {showEmoji && <EmojiPicker onSelect={insertAtCursor} onClose={() => setShowEmoji(false)} />}
          {showGif && (
            <GifPicker
              onSelect={(url) => {
                setMediaUrl(url);
                setMediaPreview(url);
                setMediaFileName(fileNameFromUrl(url));
                // A picked GIF is a remote URL, not a File - there is no byte count to state, so
                // none is claimed. The type is known from the source itself.
                setMediaSize(null);
                setMediaMime("image/gif");
                setShowGif(false);
              }}
              onClose={() => setShowGif(false)}
            />
          )}
        </AnimatePresence>
      </div>
        </>
      )}
    </div>
  );
}

function ToolButton({ onClick, icon, label, active, compactLabel }: { onClick: () => void; icon: React.ReactNode; label: string; active?: boolean; compactLabel?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex shrink-0 items-center gap-1 whitespace-nowrap rounded-md px-2 py-1 text-[11.5px] font-medium transition ${
        active ? "bg-[var(--f1-red)]/[0.14] text-[var(--f1-red)]" : "text-neutral-400 hover:bg-white/[0.05] hover:text-white"
      }`}
    >
      <span className={compactLabel ? "" : "shrink-0"}>{icon}</span>
      {label}
    </button>
  );
}

function Divider() {
  return <span aria-hidden className="h-4 w-px shrink-0 bg-white/[0.08]" />;
}

function RoundIcon() {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" fill="none" aria-hidden>
      <path d="M9 2.2v3.1M9 12.7v3.1M2.2 9h3.1M12.7 9h3.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="9" cy="9" r="3.1" stroke="currentColor" strokeWidth="1.4" />
    </svg>
  );
}

function DocumentIcon() {
  return (
    <svg viewBox="0 0 20 20" width="17" height="17" fill="none" aria-hidden>
      <path d="M11.5 2.5H6a1.5 1.5 0 0 0-1.5 1.5v12A1.5 1.5 0 0 0 6 17.5h8a1.5 1.5 0 0 0 1.5-1.5V6.5l-4-4Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
      <path d="M11.5 2.5v4h4" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}

function MediaIcon() {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" fill="none" aria-hidden>
      <rect x="2.2" y="3.2" width="13.6" height="11.6" rx="2" stroke="currentColor" strokeWidth="1.4" />
      <circle cx="6.6" cy="7.2" r="1.3" stroke="currentColor" strokeWidth="1.4" />
      <path d="m3.4 12.8 3.4-3.2 2.3 2.2 2.1-1.9 3.4 3.1" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GifIcon() {
  return (
    <span aria-hidden className="flex h-[17px] items-center rounded-[5px] border border-current px-1 text-[9px] font-bold leading-none tracking-wide">
      GIF
    </span>
  );
}

function EmojiIcon() {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="M6.4 10.4a3.1 3.1 0 0 0 5.2 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
      <circle cx="6.8" cy="7.2" r=".85" fill="currentColor" />
      <circle cx="11.2" cy="7.2" r=".85" fill="currentColor" />
    </svg>
  );
}

function PredictionIcon() {
  return (
    <svg viewBox="0 0 18 18" width="15" height="15" fill="none" aria-hidden>
      <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
      <path d="m11.7 6.3-1.6 3.9a1 1 0 0 1-.55.55L5.65 12.35l1.6-3.9a1 1 0 0 1 .55-.55L11.7 6.3Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    </svg>
  );
}
