"use client";

import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import type { GifResult } from "@/lib/gifProvider";

/** Same positioning approach as EmojiPicker (absolute within the caller's own relative toolbar,
 * not portaled) and the same honesty principle as gifProvider.ts itself: if no provider is
 * configured, this says so plainly instead of showing an empty grid that looks broken. */
export function GifPicker({ onSelect, onClose }: { onSelect: (url: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<GifResult[] | null>(null);
  const [configured, setConfigured] = useState(true);
  const rootRef = useRef<HTMLDivElement>(null);

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

  return (
    <motion.div
      ref={rootRef}
      initial={{ opacity: 0, y: 4, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      exit={{ opacity: 0, y: 4, scale: 0.98 }}
      transition={{ duration: 0.12 }}
      className="absolute bottom-full z-[150] mb-2 w-72 rounded-lg border border-[var(--f1-line)] bg-[var(--tooltip-surface-strong)] p-2 backdrop-blur-md"
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
          <p className="p-3 text-center text-xs text-neutral-500">GIF search isn&apos;t configured yet - needs a Tenor API key (see gifProvider.ts).</p>
        ) : results === null ? (
          <p className="p-3 text-center text-xs text-neutral-600">Searching…</p>
        ) : results.length === 0 ? (
          <p className="p-3 text-center text-xs text-neutral-600">{query.trim() ? "No GIFs found." : "Type to search."}</p>
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
    </motion.div>
  );
}
