"use client";

import { useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useAuth } from "@/providers/AuthProvider";
import { postKindsFor } from "@/lib/communities";
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
}: {
  groups: GroupSummary[];
  onPosted: () => void;
  fixedGroupId?: string;
  placeholder?: string;
}) {
  const { user, displayName } = useAuth();
  const [focused, setFocused] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [groupId, setGroupId] = useState(fixedGroupId ?? "");
  const [isPrediction, setIsPrediction] = useState(false);
  const [mediaPreview, setMediaPreview] = useState<string | null>(null);
  const [mediaFileName, setMediaFileName] = useState<string | null>(null);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [mediaError, setMediaError] = useState("");
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const [posting, setPosting] = useState(false);
  const [notice, setNotice] = useState("");
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
    setMediaUrl(null);
    setMediaError("");
    setNotice("");
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
    <div className="rounded-2xl border border-white/[0.07] bg-[var(--f1-carbon)]/60 p-4 backdrop-blur-sm">
      <div className="flex items-start gap-3">
        <EntityAvatar imageUrl={user?.photoURL ?? null} name={displayName ?? "You"} seed={user?.uid} size={40} />

        <div className="min-w-0 flex-1">
          {isOpen && (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Add a title (optional)"
              maxLength={300}
              className="mb-2 w-full rounded-xl border border-white/[0.07] bg-black/25 px-3.5 py-2.5 text-sm font-semibold text-white placeholder:font-normal placeholder:text-neutral-600 focus:border-white/20 focus:outline-none"
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
            className="w-full resize-none rounded-xl border border-white/[0.07] bg-black/25 px-3.5 py-2.5 text-sm leading-relaxed text-white placeholder:text-neutral-500 focus:border-white/20 focus:outline-none"
          />
        </div>
      </div>

      {mediaPreview && (
        <div className="relative ml-[52px] mt-2.5 inline-block">
          {/* Classified by the real filename's extension (mediaFileName), not the blob preview
              URL itself - a blob: URL has no extension to read. */}
          {mediaKind(mediaFileName ?? "") === "video" ? (
            <video controls className="max-h-48 rounded-xl border border-white/[0.07] bg-black">
              <source src={mediaPreview} />
            </video>
          ) : mediaKind(mediaFileName ?? "") === "document" ? (
            <div className="flex items-center gap-2.5 rounded-xl border border-white/[0.07] bg-black/20 px-3 py-2.5 text-sm text-neutral-300">
              <span aria-hidden>📎</span>
              <span className="max-w-[16rem] truncate">{mediaFileName}</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaPreview} alt="" className="max-h-48 rounded-xl border border-white/[0.07] object-contain" />
          )}
          <button
            type="button"
            onClick={removeMedia}
            aria-label="Remove media"
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/70 text-white/80 hover:bg-black/90 hover:text-white"
          >
            ×
          </button>
          {uploadingMedia && <div className="absolute inset-0 flex items-center justify-center rounded-xl bg-black/50 text-xs text-white">Uploading…</div>}
        </div>
      )}
      {mediaError && <p className="ml-[52px] mt-1.5 text-xs text-[var(--f1-red)]">{mediaError}</p>}

      <div className="relative mt-3 flex flex-wrap items-center gap-x-1 gap-y-2">
        <ToolButton onClick={() => fileInputRef.current?.click()} icon={<MediaIcon />} label="Add media" />
        <Divider />
        <ToolButton onClick={() => setShowGif((v) => !v)} active={showGif} icon={<GifIcon />} label="GIF" compactLabel />
        <Divider />
        <ToolButton onClick={() => setShowEmoji((v) => !v)} active={showEmoji} icon={<EmojiIcon />} label="Emoji" />
        {canPredict && (
          <>
            <Divider />
            <ToolButton onClick={() => setIsPrediction((v) => !v)} active={isPrediction} icon={<PredictionIcon />} label="Prediction" />
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

        <div className="ml-auto flex items-center gap-2.5">
          {notice && <span className="text-xs text-[var(--f1-red)]">{notice}</span>}
          {!fixedGroupId && isOpen && (
            <div className="w-48">
              <CommunitySelector groups={groups} value={groupId} onChange={setGroupId} />
            </div>
          )}
          {isOpen && (
            <button type="button" onClick={reset} className="text-xs text-neutral-500 transition hover:text-white">
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={posting || uploadingMedia || !content.trim()}
            className="rounded-xl bg-[var(--f1-red)] px-6 py-2 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
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
                setShowGif(false);
              }}
              onClose={() => setShowGif(false)}
            />
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}

function ToolButton({ onClick, icon, label, active, compactLabel }: { onClick: () => void; icon: React.ReactNode; label: string; active?: boolean; compactLabel?: boolean }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[12.5px] font-medium transition ${
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
