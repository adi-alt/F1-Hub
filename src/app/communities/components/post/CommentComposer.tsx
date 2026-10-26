"use client";

import { PersonAvatar } from "@/components/avatar/PersonAvatar";
import { Button } from "@/components/ui/Button";
import { fieldControlClass } from "@/components/ui/Field";
import { useRef, useState } from "react";
import { EntityAvatar } from "@/components/EntityAvatar";
import { useAuth } from "@/providers/AuthProvider";
import { EmojiPicker } from "./EmojiPicker";

/**
 * Compact composer shared by top-level comments and replies - text + emoji, matching what was
 * actually scoped here (GIF support belongs to the post composer, not every reply box).
 *
 * `variant="inline"` is the discussion window's own footer: the signed-in user's real avatar, one
 * field, and Post on the same row. The default stacked form is what a nested reply box uses, where
 * an avatar would just add another indent level to an already-indented subtree.
 */
export function CommentComposer({
  onSubmit,
  placeholder = "Add a comment...",
  autoFocus = false,
  onCancel,
  variant = "default",
  initialValue = "",
  submitLabel = "Reply",
}: {
  onSubmit: (content: string) => Promise<boolean>;
  placeholder?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  variant?: "default" | "inline";
  /** Starts filled in (editing a comment). */
  initialValue?: string;
  /** The stacked form's button: Reply, or Save / Report where it's reused. */
  submitLabel?: string;
}) {
  const { user, displayName, avatar } = useAuth();
  const [content, setContent] = useState(initialValue);
  const [posting, setPosting] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  // The emoji panel is portaled to document.body, so it anchors to this button's real viewport
  // rect - which is also what lets it work inside the floating post-detail window's own scroller.
  const emojiAnchorRef = useRef<HTMLButtonElement>(null);

  async function submit() {
    const trimmed = content.trim();
    if (!trimmed || posting) return;
    setPosting(true);
    const ok = await onSubmit(trimmed);
    if (ok) setContent("");
    setPosting(false);
  }

  function insertEmoji(emoji: string) {
    const el = inputRef.current;
    if (el) {
      const val = el.value;
      const start = el.selectionStart ?? val.length;
      const end = el.selectionEnd ?? val.length;
      const next = val.slice(0, start) + emoji + val.slice(end);
      el.value = next;
      setContent(next);
      const newPos = start + emoji.length;
      el.setSelectionRange(newPos, newPos);
      el.focus();
    } else {
      setContent((prev) => prev + emoji);
    }
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void submit();
    }
  }

  if (variant === "inline") {
    return (
      <div className="relative flex items-center gap-2.5">
        <div className="shrink-0">
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
            maxLength={1000}
            className={`h-10 py-2 leading-5 resize-none pr-11 ${fieldControlClass(false)}`}
          />
          <button
            ref={emojiAnchorRef}
            type="button"
            onClick={() => setShowEmoji((v) => !v)}
            aria-label="Add emoji"
            className="absolute right-1.5 top-1/2 flex size-8 -translate-y-1/2 items-center justify-center rounded-control text-tertiary transition-colors duration-fast hover:bg-white/[0.06] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          >
            <svg viewBox="0 0 18 18" width="15" height="15" fill="none" aria-hidden>
              <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M6.4 10.4a3.1 3.1 0 0 0 5.2 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="6.8" cy="7.2" r=".85" fill="currentColor" />
              <circle cx="11.2" cy="7.2" r=".85" fill="currentColor" />
            </svg>
          </button>
        </div>
        <Button variant="primary" size="md" className="shrink-0" onClick={() => void submit()} disabled={!content.trim()} loading={posting}>
          Post
        </Button>
        {showEmoji && <EmojiPicker anchorRef={emojiAnchorRef} onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />}
      </div>
    );
  }

  return (
    <div className="relative">
      <textarea
        ref={inputRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={onKeyDown}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={1}
        maxLength={1000}
        className={`resize-none ${fieldControlClass(false)}`}
      />
      <div className="mt-1.5 flex items-center justify-between">
        <button
          ref={emojiAnchorRef}
          type="button"
          onClick={() => setShowEmoji((v) => !v)}
          className="flex size-8 items-center justify-center rounded-control text-tertiary transition-colors duration-fast hover:bg-white/[0.06] hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
          aria-label="Add emoji"
        >
          <svg viewBox="0 0 18 18" width="15" height="15" fill="none" aria-hidden>
            <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
            <path d="M6.4 10.4a3.1 3.1 0 0 0 5.2 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
            <circle cx="6.8" cy="7.2" r=".85" fill="currentColor" />
            <circle cx="11.2" cy="7.2" r=".85" fill="currentColor" />
          </svg>
        </button>
        <div className="flex items-center gap-2">
          {onCancel && (
            <Button variant="ghost" size="sm" onClick={onCancel}>
              Cancel
            </Button>
          )}
          <Button variant="primary" size="sm" onClick={() => void submit()} disabled={!content.trim()} loading={posting}>
            {submitLabel}
          </Button>
        </div>
      </div>
      {showEmoji && <EmojiPicker anchorRef={emojiAnchorRef} onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />}
    </div>
  );
}
