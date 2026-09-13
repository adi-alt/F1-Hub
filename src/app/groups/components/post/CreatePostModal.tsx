"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";
import { POST_KIND_HINTS, POST_KIND_LABELS, type PostKind } from "@/lib/communities";

const MAX_CONTENT = 2000;
const MAX_TITLE = 300;
const MAX_MEDIA_BYTES = 500 * 1024; // images; the API route enforces the same cap server-side

export type DraftResult = { ok: true } | { ok: false; error: string };

/**
 * The composer, as a focused modal rather than an inline textarea that grows.
 *
 * Post kinds come from the community itself (postKindsFor), so a Photography community offers
 * Discussion and Question and nothing else, while an F1 community also offers Race Discussion and
 * Prediction. The kind row hides itself entirely when there's only one option - a "choice" of one
 * is noise.
 *
 * Progressive disclosure on the extras: title and image are one click away each, not two permanent
 * empty fields. No formatting toolbar, because `content` is stored and rendered as plain text
 * (PostContent renders with whitespace-pre-wrap) - a bold button that does nothing would be worse
 * than no button.
 */
export function CreatePostModal({
  communityName,
  communityAvatarUrl,
  kinds,
  onClose,
  onSubmit,
  moderationNotice,
}: {
  communityName: string;
  communityAvatarUrl: string | null;
  kinds: PostKind[];
  onClose: () => void;
  /** Resolves once the post is actually accepted. The caller owns the request so it can also do the
   * optimistic insert into its own list. */
  onSubmit: (draft: { kind: PostKind; title: string | null; content: string; mediaUrl: string | null }) => Promise<DraftResult>;
  /** Shown when this user's posts will land in the approval queue. */
  moderationNotice?: boolean;
}) {
  const [kind, setKind] = useState<PostKind>(kinds[0] ?? "discussion");
  const [content, setContent] = useState("");
  const [title, setTitle] = useState("");
  const [showTitle, setShowTitle] = useState(false);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    textareaRef.current?.focus();
  }, []);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape" && !submitting) onClose();
      // Cmd/Ctrl+Enter submits - the convention everywhere else a composer lives in a modal.
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void submit();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  });

  const trimmed = content.trim();
  const canSubmit = trimmed.length > 0 && trimmed.length <= MAX_CONTENT && !submitting && !uploading;

  async function pickMedia(file: File | undefined) {
    if (!file) return;
    if (file.size > MAX_MEDIA_BYTES) {
      setError("Image must be under 500KB.");
      return;
    }
    setUploading(true);
    setError("");
    // Field name and response shape both match /api/posts/media exactly: it reads `media` from the
    // form and answers with `mediaUrl`.
    const form = new FormData();
    form.append("media", file);
    const res = await fetch("/api/posts/media", { method: "POST", body: form }).catch(() => null);
    const body = (await res?.json().catch(() => null)) as { mediaUrl?: string; error?: string } | null;
    setUploading(false);
    if (!res?.ok || !body?.mediaUrl) {
      setError(body?.error ?? "Couldn't upload that image.");
      return;
    }
    setMediaUrl(body.mediaUrl);
  }

  async function submit() {
    if (!canSubmit) return;
    setSubmitting(true);
    setError("");
    const result = await onSubmit({ kind, title: showTitle && title.trim() ? title.trim() : null, content: trimmed, mediaUrl });
    if (!result.ok) {
      // The draft is never discarded on failure - the user's text stays exactly where it was.
      setError(result.error);
      setSubmitting(false);
      return;
    }
    onClose();
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 backdrop-blur-[2px] sm:items-center sm:p-6" onClick={() => !submitting && onClose()}>
      <motion.div
        role="dialog"
        aria-modal="true"
        aria-label="Create a post"
        initial={{ opacity: 0, y: 20, scale: 0.995 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 20, scale: 0.995 }}
        transition={{ duration: 0.16, ease: "easeOut" }}
        onClick={(e) => e.stopPropagation()}
        className="flex max-h-[92vh] w-full flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl sm:max-w-lg sm:rounded-2xl"
      >
        <header className="flex shrink-0 items-center justify-between gap-3 border-b border-white/10 px-5 py-3.5">
          <div className="flex min-w-0 items-center gap-2">
            <span className="text-sm font-semibold text-white">Create a post</span>
            <span className="truncate text-xs text-neutral-500">in {communityName}</span>
          </div>
          <button
            onClick={onClose}
            disabled={submitting}
            aria-label="Close"
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-black/40 text-white/70 transition hover:bg-black/60 hover:text-white disabled:opacity-40"
          >
            <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden>
              <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
            </svg>
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4">
          {/* One option isn't a choice - the row disappears entirely rather than showing a single
              permanently-selected pill. */}
          {kinds.length > 1 && (
            <div className="flex flex-wrap gap-1.5" role="radiogroup" aria-label="Post type">
              {kinds.map((k) => (
                <button
                  key={k}
                  type="button"
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={`rounded-full border px-3 py-1 text-xs font-medium transition ${
                    kind === k ? "border-[var(--f1-red)] bg-[var(--f1-red)]/10 text-white" : "border-[var(--f1-line)] text-neutral-400 hover:border-white/25 hover:text-neutral-200"
                  }`}
                >
                  {POST_KIND_LABELS[k]}
                </button>
              ))}
            </div>
          )}
          {kinds.length > 1 && <p className="mt-1.5 text-[11px] text-neutral-600">{POST_KIND_HINTS[kind]}</p>}

          <div className="mt-3 flex gap-2.5">
            <EntityAvatar imageUrl={communityAvatarUrl} name={communityName} size={32} />
            <div className="min-w-0 flex-1">
              {showTitle && (
                <input
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  maxLength={MAX_TITLE}
                  placeholder="Title"
                  aria-label="Post title"
                  className="mb-2 w-full rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm font-semibold text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
                />
              )}
              <textarea
                ref={textareaRef}
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={6}
                maxLength={MAX_CONTENT}
                placeholder={kind === "question" ? "What do you want to ask?" : "What do you want to talk about?"}
                aria-label="Post content"
                className="w-full resize-none rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm leading-relaxed text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
              />
            </div>
          </div>

          {mediaUrl && (
            <div className="relative mt-3 overflow-hidden rounded-lg border border-[var(--f1-line)]">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={mediaUrl} alt="" className="max-h-56 w-full object-cover" />
              <button
                type="button"
                onClick={() => setMediaUrl(null)}
                aria-label="Remove image"
                className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-black/70 text-white/80 transition hover:bg-black/90 hover:text-white"
              >
                <svg viewBox="0 0 20 20" className="h-3.5 w-3.5" fill="none" aria-hidden>
                  <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </button>
            </div>
          )}

          {error && (
            <p role="alert" className="mt-3 rounded-lg border border-[var(--f1-red)]/30 bg-[var(--f1-red)]/[0.07] px-3 py-2 text-xs text-[var(--f1-red)]">
              {error}
            </p>
          )}

          {moderationNotice && <p className="mt-3 text-[11px] text-amber-400/80">This community reviews posts before they appear.</p>}
        </div>

        <footer className="flex shrink-0 items-center justify-between gap-3 border-t border-white/10 px-5 py-3">
          <div className="flex items-center gap-1">
            {!showTitle && (
              <button type="button" onClick={() => setShowTitle(true)} className="rounded-lg px-2 py-1 text-xs text-neutral-400 transition hover:bg-white/5 hover:text-white">
                Add title
              </button>
            )}
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              className="rounded-lg px-2 py-1 text-xs text-neutral-400 transition hover:bg-white/5 hover:text-white disabled:opacity-50"
            >
              {uploading ? "Uploading…" : mediaUrl ? "Replace image" : "Add image"}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="image/png,image/jpeg,image/webp,image/gif"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                void pickMedia(file);
              }}
            />
          </div>

          <div className="flex items-center gap-3">
            {trimmed.length > MAX_CONTENT - 200 && (
              <span className={`text-[11px] tabular-nums ${trimmed.length > MAX_CONTENT ? "text-[var(--f1-red)]" : "text-neutral-600"}`}>
                {trimmed.length}/{MAX_CONTENT}
              </span>
            )}
            <button
              type="button"
              onClick={() => void submit()}
              disabled={!canSubmit}
              className="rounded-full bg-[var(--f1-red)] px-4 py-1.5 text-sm font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
            >
              {submitting ? "Posting…" : "Post"}
            </button>
          </div>
        </footer>
      </motion.div>
    </div>,
    document.body,
  );
}
