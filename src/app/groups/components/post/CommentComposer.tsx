"use client";

import { useRef, useState } from "react";
import { EmojiPicker } from "./EmojiPicker";

/** Compact composer shared by top-level comments and replies - text + emoji, matching what the
 * request actually asked for here (GIF support was scoped to the post composer, not every reply
 * box). */
export function CommentComposer({
  onSubmit,
  placeholder = "Add a comment...",
  autoFocus = false,
  onCancel,
}: {
  onSubmit: (content: string) => Promise<boolean>;
  placeholder?: string;
  autoFocus?: boolean;
  onCancel?: () => void;
}) {
  const [content, setContent] = useState("");
  const [posting, setPosting] = useState(false);
  const [showEmoji, setShowEmoji] = useState(false);
  const inputRef = useRef<HTMLTextAreaElement>(null);

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

  return (
    <div className="relative">
      <textarea
        ref={inputRef}
        value={content}
        onChange={(e) => setContent(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            void submit();
          }
        }}
        placeholder={placeholder}
        autoFocus={autoFocus}
        rows={1}
        maxLength={1000}
        className="w-full resize-none rounded-lg border border-[var(--f1-line)] bg-black/30 px-3 py-2 text-sm text-white placeholder:text-neutral-600 focus:border-white/30 focus:outline-none"
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
            className="rounded-full bg-[var(--f1-red)] px-3 py-1 text-xs font-semibold text-white transition hover:brightness-110 disabled:opacity-40"
          >
            {posting ? "Posting…" : "Comment"}
          </button>
        </div>
      </div>
      {showEmoji && <EmojiPicker onSelect={insertEmoji} onClose={() => setShowEmoji(false)} />}
    </div>
  );
}
