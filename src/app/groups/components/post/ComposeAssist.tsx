"use client";

import { useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { useAnchoredPanel } from "./usePanelDirection";

const ACTIONS: { key: string; label: string }[] = [
  { key: "improve", label: "Improve writing" },
  { key: "grammar", label: "Fix grammar" },
  { key: "concise", label: "Make concise" },
  { key: "clearer", label: "Make clearer" },
  { key: "engaging", label: "Make engaging" },
  { key: "expand", label: "Expand" },
  { key: "formal", label: "Make formal" },
];

/**
 * Apex as a writing aid on the composer's own draft.
 *
 * The rule this is built around: it never silently replaces what someone wrote. A suggestion comes
 * back beside the original with Replace and Discard, and nothing changes in the textarea until the
 * author picks Replace - so a rewrite that loses a detail, changes a claim, or simply reads worse
 * costs one click to reject rather than an undo history to recover. `onReplace` hands the text back
 * to the composer, which still requires a deliberate Post afterwards; nothing here can publish.
 */
export function ComposeAssist({ draft, onReplace }: { draft: string; onReplace: (text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [suggestion, setSuggestion] = useState<string | null>(null);
  const [error, setError] = useState("");
  const triggerRef = useRef<HTMLButtonElement>(null);
  // Portaled for the same reason the Emoji and GIF panels are - see useAnchoredPanel.
  const style = useAnchoredPanel(triggerRef, 288, 300);

  const hasDraft = draft.trim().length > 0;

  async function run(action: string) {
    setBusy(action);
    setError("");
    setSuggestion(null);
    try {
      const res = await fetch("/api/ai/compose-assist", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: draft, action }),
      });
      const body = (await res.json().catch(() => null)) as { suggestion?: string; error?: string } | null;
      if (!res.ok || !body?.suggestion) {
        setError(body?.error ?? "Apex couldn't rewrite that.");
        return;
      }
      setSuggestion(body.suggestion);
    } catch {
      setError("Apex is unavailable right now.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        disabled={!hasDraft}
        aria-expanded={open}
        aria-label="Apex writing suggestions"
        title={hasDraft ? "Apex writing suggestions" : "Write something first"}
        className={`flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md px-2 py-1 text-[12px] font-medium transition disabled:opacity-40 ${
          open ? "bg-[var(--f1-red)]/[0.14] text-[var(--f1-red)]" : "text-neutral-400 hover:bg-white/[0.05] hover:text-white"
        }`}
      >
        <span aria-hidden>✦</span>
        Apex
      </button>

      <AnimatePresence>
        {open && style && typeof document !== "undefined" && createPortal(
          <motion.div
            initial={{ opacity: 0, y: 4, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 4, scale: 0.98 }}
            transition={{ duration: 0.12 }}
            style={style}
            className="overflow-y-auto rounded-lg border border-[var(--f1-line)] bg-[var(--tooltip-surface-strong)] p-2 shadow-2xl backdrop-blur-md scrollbar-hide"
          >
            {suggestion === null ? (
              <>
                <p className="px-0.5 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Rewrite this draft</p>
                <div className="grid grid-cols-2 gap-1">
                  {ACTIONS.map((a) => (
                    <button
                      key={a.key}
                      type="button"
                      disabled={busy !== null}
                      onClick={() => void run(a.key)}
                      className="rounded-md px-2 py-1.5 text-left text-[11.5px] text-neutral-300 transition hover:bg-white/[0.06] hover:text-white disabled:opacity-40"
                    >
                      {busy === a.key ? "Writing…" : a.label}
                    </button>
                  ))}
                </div>
                {error && <p className="mt-1.5 px-0.5 text-[11px] text-[var(--f1-red)]">{error}</p>}
              </>
            ) : (
              <>
                <p className="px-0.5 pb-1 text-[9.5px] font-semibold uppercase tracking-[0.14em] text-neutral-500">Apex suggests</p>
                <p className="max-h-40 overflow-y-auto whitespace-pre-wrap rounded-md bg-black/25 p-2 text-[11.5px] leading-relaxed text-neutral-200 scrollbar-hide">{suggestion}</p>
                <div className="mt-1.5 flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => {
                      onReplace(suggestion);
                      setSuggestion(null);
                      setOpen(false);
                    }}
                    className="rounded-md bg-[var(--f1-red)] px-2.5 py-1 text-[11.5px] font-semibold text-white transition hover:brightness-110"
                  >
                    Replace
                  </button>
                  <button type="button" onClick={() => setSuggestion(null)} className="rounded-md px-2 py-1 text-[11.5px] font-medium text-neutral-400 transition hover:text-white">
                    Back
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setSuggestion(null);
                      setOpen(false);
                    }}
                    className="ml-auto rounded-md px-2 py-1 text-[11.5px] text-neutral-500 transition hover:text-white"
                  >
                    Discard
                  </button>
                </div>
              </>
            )}
          </motion.div>,
          document.body,
        )}
      </AnimatePresence>
    </div>
  );
}
