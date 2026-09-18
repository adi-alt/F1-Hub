"use client";

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
}: {
  onSubmit: (content: string) => Promise<boolean>;
  placeholder?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
  variant?: "default" | "inline";
}) {
  const { user, displayName } = useAuth();
  const [content, setContent] = useState("");
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
    setContent((prev) => prev + emoji);
    setShowEmoji(false);
    inputRef.current?.focus();
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
        <EntityAvatar imageUrl={user?.photoURL ?? null} name={displayName ?? "You"} seed={user?.uid} size={32} />
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
            className="w-full resize-none rounded-xl border border-white/[0.08] bg-black/25 py-2.5 pl-3.5 pr-10 text-sm text-white placeholder:text-neutral-500 focus:border-white/20 focus:outline-none"
          />
          <button
            ref={emojiAnchorRef}
            type="button"
            onClick={() => setShowEmoji((v) => !v)}
            aria-label="Add emoji"
            className="absolute right-2 top-1/2 flex h-7 w-7 -translate-y-1/2 items-center justify-center rounded-lg text-neutral-500 transition hover:bg-white/[0.06] hover:text-white"
          >
            <svg viewBox="0 0 18 18" width="15" height="15" fill="none" aria-hidden>
              <circle cx="9" cy="9" r="6.5" stroke="currentColor" strokeWidth="1.4" />
              <path d="M6.4 10.4a3.1 3.1 0 0 0 5.2 0" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
              <circle cx="6.8" cy="7.2" r=".85" fill="currentColor" />
              <circle cx="11.2" cy="7.2" r=".85" fill="currentColor" />
            </svg>
          </button>
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={posting || !content.trim()}
          className="shrink-0 rounded-xl bg-[var(--f1-red)] px-5 py-2.5 text-[13px] font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
        >
          {posting ? "Posting…" : "Post"}
        </button>
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
        className="w-full resize-none rounded-xl border border-white/[0.08] bg-black/25 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-white/20 focus:outline-none"
      />
      <div className="mt-1.5 flex items-center justify-between">
        <button type="button" onClick={() => setShowEmoji((v) => !v)} className="rounded p-1 text-sm text-neutral-500 transition hover:bg-white/[0.06] hover:text-white" aria-label="Add emoji">
          🙂
        </button>
        <div className="flex items-center gap-2">
          {onCancel && (
            <button type="button" onClick={onCancel} className="text-xs text-neutral-500 hover:text-white">
              Cancel
            </button>
          )}
          <button
            type="button"
            onClick={() => void submit()}
            disabled={posting || !content.trim()}
            className="rounded-full bg-[var(--f1-red)] px-3.5 py-1.5 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {posting ? "Posting…" : "Reply"}
          </button>
        </div>
      </div>
      {showEmoji && <EmojiPicker anchorRef={emojiAnchorRef} onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />}
    </div>
  );
}
