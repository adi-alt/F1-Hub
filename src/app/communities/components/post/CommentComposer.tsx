"use client";

import { PersonAvatar } from "@/components/avatar/PersonAvatar";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import { FaceSlightlySmiling, Image, ImagePlay, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useAuth } from "@/providers/AuthProvider";
import { PANEL } from "../panel";
import { EmojiPicker } from "./EmojiPicker";
import { GifPicker } from "./GifPicker";
import { MentionAutocomplete } from "./MentionAutocomplete";

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

function checkMention(val: string, pos: number): { query: string; startIndex: number } | null {
  const before = val.slice(0, pos);
  const match = /(?:^|\s)@([a-zA-Z0-9_.-]*)$/.exec(before);
  if (!match) return null;
  const atPos = before.lastIndexOf("@");
  return { query: match[1], startIndex: atPos };
}

/**
 * Unified glass-panel comment & reply composer matching `PostComposer`: a borderless auto-expanding
 * textarea on top and monochrome `rounded-control` tool buttons (Photo, GIF, Emoji) + Submit on the
 * bottom row inside one rounded-rectangle container.
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
  groupId,
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
  /** Community the discussion belongs to, for member autocomplete scoping. */
  groupId?: string | null;
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
  const [mentionState, setMentionState] = useState<{ query: string; startIndex: number } | null>(null);
  const justSelectedRef = useRef(false);
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
    const nextHeight = Math.min(Math.max(el.scrollHeight, 24), 132);
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

  function handleContentChange(e: React.ChangeEvent<HTMLTextAreaElement>) {
    const next = e.target.value;
    setContent(next);
    const pos = e.target.selectionStart ?? next.length;
    setMentionState(checkMention(next, pos));
  }

  function handleSelectMention(username: string) {
    if (!mentionState) return;
    const el = inputRef.current;
    const pos = el?.selectionStart ?? content.length;
    const before = content.slice(0, mentionState.startIndex);
    const after = content.slice(pos);
    const next = `${before}@${username} ${after}`.slice(0, MAX_CHARS);
    setContent(next);
    setMentionState(null);
    justSelectedRef.current = true;
    setTimeout(() => {
      justSelectedRef.current = false;
    }, 300);
    requestAnimationFrame(() => {
      if (el) {
        el.focus();
        const nextPos = Math.min(mentionState.startIndex + username.length + 2, MAX_CHARS);
        el.setSelectionRange(nextPos, nextPos);
      }
    });
  }

  function handleKeyUp(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "ArrowLeft" || e.key === "ArrowRight") {
      const pos = e.currentTarget.selectionStart ?? content.length;
      setMentionState(checkMention(content, pos));
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
    if (mentionState) {
      if (e.key === "Enter" || e.key === "Tab" || e.key === "ArrowDown" || e.key === "ArrowUp" || e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        return;
      }
    }
    if (justSelectedRef.current && (e.key === "Enter" || e.key === "Tab")) {
      e.preventDefault();
      return;
    }
    // Cmd+Enter or Ctrl+Enter submits
    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
      e.preventDefault();
      void submit();
    }
  }

  const mediaPreview = (mediaUrl || uploadingMedia || uploadError) && (
    <div className="mt-2 flex items-center gap-2">
      {uploadingMedia && (
        <span className="inline-flex items-center gap-1.5 rounded-control border border-white/10 bg-surface-2 px-2.5 py-1 text-caption text-secondary">
          Uploading image…
        </span>
      )}
      {uploadError && (
        <span className="inline-flex items-center gap-2 rounded-control border border-danger/30 bg-danger/10 px-2.5 py-1 text-caption text-danger">
          {uploadError}
          <button
            type="button"
            onClick={() => setUploadError(null)}
            className="rounded-control text-secondary hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
            aria-label="Dismiss upload error"
          >
            <Icon icon={X} size={16} />
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
            className="absolute right-1 top-1 flex size-6 items-center justify-center rounded-control bg-black/80 text-white transition-colors hover:bg-black focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Icon icon={X} size={16} />
          </button>
        </div>
      )}
    </div>
  );

  const toolButtons = (
    <div className="-ml-1 flex items-center gap-0.5">
      {mediaEnabled && (
        <>
          <button
            type="button"
            onClick={() => fileInputRef.current?.click()}
            aria-label="Attach photo"
            title="Attach photo (max 500KB)"
            className="flex size-7 shrink-0 items-center justify-center rounded-control text-tertiary transition-colors duration-fast hover:bg-white/[0.07] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <Icon icon={Image} size={16} />
          </button>
          <button
            ref={gifAnchorRef}
            type="button"
            aria-pressed={showGif}
            onClick={() => {
              setShowEmoji(false);
              setShowGif((v) => !v);
            }}
            aria-label="Add GIF"
            title="Add GIF"
            className={`flex size-7 shrink-0 items-center justify-center rounded-control transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
              showGif ? "bg-white/[0.1] text-primary" : "text-tertiary hover:bg-white/[0.07] hover:text-primary"
            }`}
          >
            <Icon icon={ImagePlay} size={16} />
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
      <button
        ref={emojiAnchorRef}
        type="button"
        aria-pressed={showEmoji}
        onClick={() => {
          setShowGif(false);
          setShowEmoji((v) => !v);
        }}
        aria-label="Add emoji"
        title="Add emoji"
        className={`flex size-7 shrink-0 items-center justify-center rounded-control transition-colors duration-fast focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring ${
          showEmoji ? "bg-white/[0.1] text-primary" : "text-tertiary hover:bg-white/[0.07] hover:text-primary"
        }`}
      >
        <Icon icon={FaceSlightlySmiling} size={16} />
      </button>
    </div>
  );

  const charCounter = content.length >= 750 && (
    <span className={`font-mono text-caption tabular-nums ${content.length >= 920 ? "text-warning" : "text-tertiary"}`}>
      {content.length}/{MAX_CHARS}
    </span>
  );

  return (
    <div className={`relative px-3 py-2.5 ${PANEL} transition-colors duration-fast focus-within:border-white/[0.18]`}>
      <div className="flex items-start gap-2.5">
        {variant === "inline" && (
          <div className="shrink-0 pt-0.5">
            <PersonAvatar id={user?.uid ?? ""} avatar={avatar} size={28} />
          </div>
        )}
        <div className="min-w-0 flex-1">
          <textarea
            ref={inputRef}
            value={content}
            onChange={handleContentChange}
            onKeyDown={onKeyDown}
            onKeyUp={handleKeyUp}
            placeholder={placeholder}
            autoFocus={autoFocus}
            rows={1}
            maxLength={MAX_CHARS}
            className="block max-h-32 min-h-[1.5rem] w-full resize-none bg-transparent py-0.5 text-body-sm leading-5 text-primary placeholder:text-tertiary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-transparent"
          />
          {mediaPreview}
        </div>
      </div>

      {mentionState && (
        <MentionAutocomplete
          query={mentionState.query}
          groupId={groupId}
          onSelect={handleSelectMention}
          onClose={() => setMentionState(null)}
        />
      )}

      <div className={`mt-2 flex items-center justify-between gap-2 border-t border-white/[0.05] pt-2 ${variant === "inline" ? "pl-9" : ""}`}>
        <div className="flex items-center gap-2">
          {toolButtons}
          {charCounter}
        </div>
        <div className="flex items-center gap-1.5">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={cancel}>
              Cancel
            </Button>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={() => void submit()}
            disabled={!canSubmit}
            loading={posting}
            title="Post comment (Cmd+Enter or Ctrl+Enter)"
          >
            {variant === "inline" ? "Post" : submitLabel}
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
