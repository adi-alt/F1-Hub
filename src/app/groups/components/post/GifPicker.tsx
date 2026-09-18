"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { motion } from "framer-motion";
import type { GifResult } from "@/lib/gifProvider";
import { createPortal } from "react-dom";
import { useAnchoredPanel } from "./usePanelDirection";

/** Same positioning approach as EmojiPicker (portaled to document.body, anchored in viewport
 * coordinates, so the centre column's scroll container can't clip it) and the same honesty
 * principle as gifProvider.ts itself: if no provider is configured, this says so plainly instead of
 * showing an empty grid that looks broken. */
export function GifPicker({ onSelect, onClose, anchorRef }: { onSelect: (url: string) => void; onClose: () => void; anchorRef: RefObject<HTMLElement | null> }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResult[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);
  const style = useAnchoredPanel(anchorRef, 288, 340);

  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => {
      fetch(`/api/gifs/search?q=${encodeURIComponent(query)}`, { signal: controller.signal })
        .then((res) => res.json())
        .then((body: { results: GifResult[]; configured: boolean }) => {
          setResults(body.results);
          setConfigured(body.configured);
        })
        .catch(() => {});
    }, 250);
    return () => {
      clearTimeout(timeout);
      controller.abort();
    };
  }, [query]);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) onClose();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", onDocClick);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocClick);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  if (typeof document === "undefined" || !style) return null;

  return createPortal(
    <motion.div
      ref={rootRef}
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.98 }}
      transition={{ duration: 0.12 }}
      style={style}
      className="overflow-y-auto rounded-lg border border-[var(--f1-line)] bg-[var(--tooltip-surface-strong)] p-2 shadow-2xl backdrop-blur-md scrollbar-hide"
    >
      <input
        autoFocus
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search GIFs..."
        className="w-full rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-600 focus:outline-none"
      />
      <div className="mt-2 max-h-52 overflow-y-auto">
        {!configured ? (
          <p className="p-3 text-center text-xs text-neutral-500">GIF search isn&apos;t configured yet - needs KLIPY_API_KEY set (see gifProvider.ts).</p>
        ) : results === null ? (
          <p className="p-3 text-center text-xs text-neutral-600">Searching…</p>
        ) : results.length === 0 ? (
          <p className="p-3 text-center text-xs text-neutral-600">No GIFs found.</p>
        ) : (
          <div className="grid grid-cols-2 gap-1.5">
            {results.map((g) => (
              <button key={g.id} type="button" onClick={() => onSelect(g.url)} className="overflow-hidden rounded-md border border-white/10 hover:border-white/30">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={g.previewUrl} alt={g.alt} className="h-20 w-full object-cover" />
              </button>
            ))}
          </div>
        )}
      </div>
    </motion.div>,
    document.body,
  );
}
