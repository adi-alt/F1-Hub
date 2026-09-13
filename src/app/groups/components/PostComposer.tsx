"use client";

import { useRef, useState } from "react";
import { AnimatePresence } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useAuth } from "@/providers/AuthProvider";
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

/** Collapsed to a single "what's happening" trigger row until clicked - matches the reference
 * composer's own collapsed/expanded split (internal ForumShift project) rather than always
 * showing the full form. A community is genuinely optional (CommunitySelector's own "No
 * community" option) - selecting nothing posts a real personal post, not a fake default group.
 * `fixedGroupId` is the one thing that changes when a group's own page renders this (GroupFeed.tsx)
 * instead of the Groups home feed - the target is already known, so the selector itself is
 * pointless there and hidden entirely rather than shown pre-filled and disabled. */
export function PostComposer({ groups, onPosted, fixedGroupId, placeholder }: { groups: GroupSummary[]; onPosted: () => void; fixedGroupId?: string; placeholder?: string }) {
  const { user, displayName } = useAuth();
  const [expanded, setExpanded] = useState(false);
  const [title, setTitle] = useState("");
  const [content, setContent] = useState("");
  const [groupId, setGroupId] = useState(fixedGroupId ?? "");
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

  function reset() {
    setExpanded(false);
    setTitle("");
    setContent("");
    setGroupId(fixedGroupId ?? "");
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
      body: JSON.stringify({ groupId: groupId || null, title: title.trim() || undefined, content: trimmed, mediaUrl }),
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

  if (!expanded) {
    return (
      <button
        onClick={() => setExpanded(true)}
        className="flex w-full items-center gap-3 rounded-lg border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 px-3.5 py-2.5 text-left text-sm text-neutral-500 transition hover:border-white/20"
      >
        <EntityAvatar imageUrl={user?.photoURL ?? null} name={displayName ?? "You"} size={28} />
        {placeholder ?? "What's happening in F1?"}
      </button>
    );
  }

  return (
    <div className="rounded-lg border border-[var(--f1-line)] bg-[var(--f1-carbon)]/60 p-3.5">
      <div className="flex items-center justify-between">
        <p className="text-sm font-semibold text-white">Create a post</p>
        <button type="button" onClick={reset} className="text-xs text-neutral-500 hover:text-white">
          Cancel
        </button>
      </div>

      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title (optional)"
        maxLength={300}
        className="mt-3 w-full rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm font-medium text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
      />
      <textarea
        ref={bodyRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        placeholder={placeholder ?? "What's happening in F1?"}
        rows={3}
        maxLength={2000}
        className="mt-2 w-full resize-none rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
      />

      {mediaPreview && (
        <div className="relative mt-2 inline-block">
          {/* Classified by the real filename's extension (mediaFileName), not the blob preview
              URL itself - a blob: URL has no extension to read. */}
          {mediaKind(mediaFileName ?? "") === "video" ? (
            <video controls className="max-h-48 rounded-lg border border-[var(--f1-line)] bg-black">
              <source src={mediaPreview} />
            </video>
          ) : mediaKind(mediaFileName ?? "") === "document" ? (
            <div className="flex items-center gap-2.5 rounded-lg border border-[var(--f1-line)] bg-black/20 px-3 py-2.5 text-sm text-neutral-300">
              <span aria-hidden>📎</span>
              <span className="max-w-[16rem] truncate">{mediaFileName}</span>
            </div>
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={mediaPreview} alt="" className="max-h-48 rounded-lg border border-[var(--f1-line)] object-contain" />
          )}
          <button
            type="button"
            onClick={removeMedia}
            aria-label="Remove media"
            className="absolute right-1.5 top-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-black/60 text-white/80 hover:bg-black/80 hover:text-white"
          >
            ×
          </button>
          {uploadingMedia && <div className="absolute inset-0 flex items-center justify-center rounded-lg bg-black/40 text-xs text-white">Uploading…</div>}
        </div>
      )}
      {mediaError && <p className="mt-1.5 text-xs text-[var(--f1-red)]">{mediaError}</p>}

      <div className="relative mt-2.5 flex items-center gap-1">
        <button type="button" onClick={() => fileInputRef.current?.click()} className="rounded-md px-2 py-1 text-xs text-neutral-400 transition hover:bg-white/[0.06] hover:text-white">
          📎 Attach
        </button>
        <button type="button" onClick={() => setShowGif((v) => !v)} className="rounded-md px-2 py-1 text-xs text-neutral-400 transition hover:bg-white/[0.06] hover:text-white">
          GIF
        </button>
        <button type="button" onClick={() => setShowEmoji((v) => !v)} className="rounded-md px-2 py-1 text-xs text-neutral-400 transition hover:bg-white/[0.06] hover:text-white">
          🙂 Emoji
        </button>
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

      <div className="mt-3 flex items-center justify-between gap-3">
        {fixedGroupId ? (
          <span />
        ) : (
          <div className="w-56">
            <CommunitySelector groups={groups} value={groupId} onChange={setGroupId} />
          </div>
        )}
        <div className="flex items-center gap-3">
          {notice && <span className="text-xs text-neutral-500">{notice}</span>}
          <button
            onClick={() => void submit()}
            disabled={posting || uploadingMedia || !content.trim()}
            className="rounded-full bg-[var(--f1-red)] px-4 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {posting ? "Posting…" : "Post"}
          </button>
        </div>
      </div>
    </div>
  );
}
