"use client";

import { useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { useOnClickOutside } from "@/hooks/useOnClickOutside";
import { copyTextToClipboard } from "@/lib/export";

// Same glass treatment ExportMenu.tsx's own dropdown already uses - every floating panel on the
// site reads consistently instead of one being a flat opaque box.
const GLASS_STYLE = {
  backgroundColor: "var(--tooltip-surface-strong)",
  backdropFilter: "blur(var(--tooltip-blur))",
  WebkitBackdropFilter: "blur(var(--tooltip-blur))",
};

/** The race header's own ⋮ menu - same trigger/dropdown shape and styling as
 * ExportMenu.tsx (Season's own ⋮ menu on the standings table), reused rather than a new menu
 * design, just with race-appropriate actions instead of CSV/image export. Only ever shows actions
 * that are real: Copy link always works; the external link only appears when the race actually
 * has one (archive races with a Wikipedia report - current-season races don't). */
export function RaceActionsMenu({ externalLink }: { externalLink?: { href: string; label: string } }) {
  const [open, setOpen] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  function close() {
    setOpen(false);
    setStatus(null);
  }
  useOnClickOutside(rootRef, open, close);

  async function handleCopyLink() {
    await copyTextToClipboard(window.location.href);
    setStatus("Link copied");
    setTimeout(close, 1000);
  }

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-label="Race actions"
        aria-expanded={open}
        className="flex h-7 w-7 items-center justify-center rounded-full text-neutral-400 opacity-80 transition hover:bg-white/10 hover:text-white hover:opacity-100"
      >
        <svg viewBox="0 0 20 20" fill="currentColor" className="h-4 w-4">
          <circle cx="10" cy="4" r="1.5" />
          <circle cx="10" cy="10" r="1.5" />
          <circle cx="10" cy="16" r="1.5" />
        </svg>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ duration: 0.15, ease: "easeOut" }}
            className="absolute right-0 top-full z-30 mt-2 w-48 overflow-hidden rounded-xl border border-[var(--tooltip-border)] py-1 text-sm shadow-xl backdrop-blur-md"
            style={GLASS_STYLE}
          >
            {status ? (
              <p className="px-4 py-2.5 text-neutral-300">{status}</p>
            ) : (
              <>
                <button onClick={() => void handleCopyLink()} className="block w-full px-4 py-2 text-left text-neutral-300 transition hover:bg-white/5 hover:text-white">
                  Copy link
                </button>
                {externalLink && (
                  <a
                    href={externalLink.href}
                    target="_blank"
                    rel="noreferrer"
                    onClick={close}
                    className="block w-full px-4 py-2 text-left text-neutral-300 transition hover:bg-white/5 hover:text-white"
                  >
                    {externalLink.label} ↗
                  </a>
                )}
              </>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
