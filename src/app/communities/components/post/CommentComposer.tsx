"use client";

import { PersonAvatar } from "@/components/avatar/PersonAvatar";
import { Button } from "@/components/ui/Button";
import { fieldControlClass } from "@/components/ui/Field";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { EmojiPicker } from "./EmojiPicker";
import { GifPicker } from "./GifPicker";

const DRAFT_PREFIX = "f1hub_comment_draft:";
const MAX_CHARS = 1000;

function readDraft(key: string): string | null {
  try {
    const value = localStorage.getItem(key);
    return value || null;
  } catch {
    return null;
  }
}

function clearDraft(key: string | null) {
  if (!key) return;
  try {
    localStorage.removeItem(key);
  } catch {
    // Draft persistence is best-effort only.
  }
}

/**
 * Rich comment & reply composer with auto-expanding textarea, Emoji picker, GIF picker, image
 * upload, quote insertion, and per-thread localStorage draft persistence.
 *
 * `variant="inline"` is the discussion window's own footer. The default stacked form is used by
 * nested reply boxes, inline edits, and report forms.
 */
export function CommentComposer({
  onSubmit,
  placeholder = "Add a comment...",
  autoFocus = false,
  onCancel,
  variant = "default",
  initialValue = "",
  submitLabel = "Reply",
  draftKey,
  allowMedia,
  quoteText,
  onQuoteConsumed,
}: {
  onSubmit: (content: string, mediaUrl?: string | null) => Promise<boolean>;
  placeholder?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  variant?: "default" | "inline";
  /** Starts filled in (editing a comment). */
  initialValue?: string;
  /** The stacked form's button: Reply, or Save / Report where it's reused. */
  submitLabel?: string;
  /** Stable identity for a top-level comment or reply draft. Omitted for edit/report forms. */
  draftKey?: string;
  /** Whether GIF and image attachments are enabled (defaults to true except on Save/Report forms). */
  allowMedia?: boolean;
  /** Optional markdown quote block (`> @Author: ...`) to append and focus when clicked from a comment. */
  quoteText?: string | null;
  onQuoteConsumed?: () => void;
}) {
  const { user, avatar } = useAuth();
  const mediaEnabled = allowMedia ?? (submitLabel !== "Save" && submitLabel !== "Report");
  const storageKey = user?.uid && draftKey ? `${DRAFT_PREFIX}${user.uid}:${draftKey}` : null;
  const [content, setContent] = useState(initialValue);
  const [mediaUrl, setMediaUrl] = useState<string | null>(null);
  const [uploadingMedia, setUploadingMedia] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [posting, setPosting] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const [showGif, setShowGif] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const draftLoaded = useRef(false);
  const emojiAnchorRef = useRef<HTMLButtonElement>(null);
  const gifAnchorRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!storageKey || draftLoaded.current) return;
    const saved = readDraft(storageKey);
    if (!saved) {
      draftLoaded.current = true;
      return;
    }
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      draftLoaded.current = true;
      setContent(saved);
    });
    return () => {
      cancelled = true;
    };
  }, [storageKey]);

  useEffect(() => {
    if (!storageKey || !draftLoaded.current) return;
    if (!content.trim()) {
      clearDraft(storageKey);
      return;
    }
    try {
      localStorage.setItem(storageKey, content);
    } catch {
      // Draft persistence is best-effort only.
    }
  }, [content, storageKey]);

  useEffect(() => {
    if (!quoteText) return;
    let cancelled = false;
    queueMicrotask(() => {
      if (cancelled) return;
      setContent((prev) => {
        const prefix = prev.trim() ? `${prev.trimEnd()}\n\n` : "";
        return `${prefix}${quoteText}\n\n`.slice(0, MAX_CHARS);
      });
      onQuoteConsumed?.();
      requestAnimationFrame(() => {
        const el = inputRef.current;
        if (el) {
          el.focus();
          el.setSelectionRange(el.value.length, el.value.length);
        }
      });
    });
    return () => {
      cancelled = true;
    };
  }, [quoteText, onQuoteConsumed]);

  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    const nextHeight = Math.min(Math.max(el.scrollHeight, 40), 144);
    el.style.height = `${nextHeight}px`;
  }, [content]);

  const canSubmit = (Boolean(content.trim()) || Boolean(mediaUrl)) && !posting && !uploadingMedia;

  async function submit() {
    const trimmed = content.trim();
    if ((!trimmed && !mediaUrl) || posting || uploadingMedia) return;
    setPosting(true);
    const ok = await onSubmit(trimmed, mediaUrl);
    if (ok) {
      clearDraft(storageKey);
      setContent("");
      setMediaUrl(null);
      setUploadError(null);
    }
    setPosting(false);
  }

  function cancel() {
    clearDraft(storageKey);
    setMediaUrl(null);
    setUploadError(null);
    onCancel?.();
  }

  function insertEmoji(emoji: string) {
    const el = inputRef.current;
    if (el) {
      const val = el.value;
      const start = el.selectionStart ?? val.length;
      const end = el.selectionEnd ?? val.length;
      const next = (val.slice(0, start) + emoji + val.slice(end)).slice(0, MAX_CHARS);
      el.value = next;
      setContent(next);
      const newPos = Math.min(start + emoji.length, MAX_CHARS);
      el.setSelectionRange(newPos, newPos);
      el.focus();
    } else {
      setContent((prev) => (prev + emoji).slice(0, MAX_CHARS));
    }
  }

  async function handleFileSelect(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploadError(null);
    setUploadingMedia(true);
    try {
      const form = new FormData();
      form.append("media", file);
      const res = await fetch("/api/posts/media", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { mediaUrl?: string; error?: string };
      if (!res.ok || !body.mediaUrl) {
        setUploadError(body.error ?? "Upload failed (max 500KB image).");
      } else {
        setMediaUrl(body.mediaUrl);
      }
    } catch {
      setUploadError("Upload failed.");
    } finally {
      setUploadingMedia(false);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  const mediaPreview = (mediaUrl || uploadingMedia || uploadError) && (
    <div className="mb-2 flex items-center gap-2.5">
      {uploadingMedia && (
        <span className="inline-flex items-center gap-1.5 rounded-control border border-white/10 bg-white/[0.04] px-2.5 py-1 text-caption text-secondary">
          Uploading image…
        </span>
      )}
      {uploadError && (
        <span className="inline-flex items-center gap-2 rounded-control border border-danger/30 bg-danger/10 px-2.5 py-1 text-caption text-danger">
          {uploadError}
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="text-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            aria-label="Dismiss upload error"
          >
            ×
          </button>
        </span>
      )}
      {mediaUrl && (
        <div className="relative inline-block overflow-hidden rounded-control border border-white/15 bg-surface-1">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={mediaUrl} alt="Comment attachment preview" className="max-h-24 max-w-44 object-cover" />
          <button
            type="button"
            onClick={() => setMediaUrl(null)}
            aria-label="Remove attachment"
            className="absolute right-1 top-1 flex size-5 items-center justify-center rounded-full bg-black/75 text-caption text-white transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            ×
          </button>
        </div>
      )}
    </div>
  );

  const mediaButtons = (
    <div className="flex items-center gap-0.5">
      <button
        ref={emojiAnchorRef}
        type="button"
        onClick={() => {
          setShowGif(false);
          setShowEmoji((v) => !v);
        }}
        aria-label="Add emoji"
        title="Add emoji"
        className="flex size-8 items-center justify-center rounded-control text-tertiary transition-colors duration-fast hover:bg-white/[0.06] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <svg viewBox="0 0 18 18" width="15" height="15" fill="none" aria-hidden>
          <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
          <path d="M6.4 10.4a3.1 3.1 0 0 0 5.2 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
          <circle cx="6.8" cy="7.2" r=".85" fill="currentColor" />
          <circle cx="11.2" cy="7.2" r=".85" fill="currentColor" />
        </svg>
      </button>
      {mediaEnabled && (
        <>
          <button
            ref={gifAnchorRef}
            type="button"
            onClick={() => {
              setShowEmoji(false);
              setShowGif((v) => !v);
            }}
            aria-label="Add GIF"
            title="Add GIF"
            className="flex h-8 items-center justify-center rounded-control px-1.5 text-caption font-semibold tracking-wider text-tertiary transition-colors duration-fast hover:bg-white/[0.06] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            GIF
          </button>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach image"
            title="Attach image (max 500KB)"
            className="flex size-8 items-center justify-center rounded-control text-tertiary transition-colors duration-fast hover:bg-white/[0.06] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <svg viewBox="0 0 18 18" width="15" height="15" fill="none" aria-hidden>
              <rect x="2.5" y="3.5" width="13" height="11" rx="2" stroke="currentColor" strokeWidth="1.4" />
              <circle cx="6.5" cy="7.2" r="1.1" fill="currentColor" />
              <path d="m3.5 13 3.6-3.4a1 1 0 0 1 1.4 0l2.1 2 1.8-1.7a1 1 0 0 1 1.4 0l1.7 1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept="image/png,image/jpeg,image/webp,image/gif"
            onChange={(e) => void handleFileSelect(e)}
            className="hidden"
          />
        </>
      )}
    </div>
  );

  const charCounter = content.length >= 750 && (
    <span className={`font-mono text-caption tabular-nums ${content.length >= 920 ? "text-warning" : "text-tertiary"}`}>
      {content.length}/{MAX_CHARS}
    </span>
  );

  if (variant === "inline") {
    return (
      <div className="relative">
        {mediaPreview}
        <div className="relative flex items-end gap-2.5">
          <div className="shrink-0 pb-0.5">
            <PersonAvatar id={user?.uid ?? ""} avatar={avatar} size={36} />
          </div>
          <div className="relative min-w-0 flex-1">
            <textarea
              ref={inputRef}
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder={placeholder}
              autoFocus={autoFocus}
              rows={1}
              maxLength={MAX_CHARS}
              className={`min-h-10 max-h-36 py-2 leading-5 resize-none pr-28 ${fieldControlClass(false)}`}
            />
            <div className="absolute bottom-1 right-1.5 flex items-center gap-1">
              {charCounter}
              {mediaButtons}
            </div>
          </div>
          <Button variant="primary" size="md" className="shrink-0" onClick={() => void submit()} disabled={!canSubmit} loading={posting}>
            Post
          </Button>
        </div>
        {showEmoji && <EmojiPicker anchorRef={emojiAnchorRef} onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />}
        {showGif && (
          <GifPicker
            anchorRef={gifAnchorRef}
            onSelect={(url) => {
              setMediaUrl(url);
              setShowGif(false);
            }}
            onClose={() => setShowGif(false)}
          />
        )}
      </div>
    );
  }

  return (
    <div className="relative">
      {mediaPreview}
      <textarea
        ref={inputRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={1}
        maxLength={MAX_CHARS}
        className={`min-h-10 max-h-36 py-2 leading-5 resize-none ${fieldControlClass(false)}`}
      />
      <div className="mt-1.5 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          {mediaButtons}
          {charCounter}
        </div>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={cancel}>
              Cancel
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={() => void submit()} disabled={!canSubmit} loading={posting}>
            {submitLabel}
          </Button>
        </div>
      </div>
      {showEmoji && <EmojiPicker anchorRef={emojiAnchorRef} onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />}
      {showGif && (
        <GifPicker
          anchorRef={gifAnchorRef}
          onSelect={(url) => {
            setMediaUrl(url);
            setShowGif(false);
          }}
          onClose={() => setShowGif(false)}
        />
      )}
    </div>
  );
}
