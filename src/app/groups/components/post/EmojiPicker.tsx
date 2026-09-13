"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, motion } from "framer-motion";

// A curated, hand-picked set (~70), not the full Unicode CLDR list - a real, searchable-by-keyword
// picker (not a fake one), just scoped to what a motorsport community actually reaches for instead
// of every emoji that exists. Recent picks persist per-browser via localStorage (a real, if small,
// convenience - not critical state, fine to lose if storage is unavailable).
const EMOJI: { char: string; keywords: string }[] = [
  { char: "🏎️", keywords: "race car f1 racing" },
  { char: "🏁", keywords: "checkered flag finish race" },
  { char: "🥇", keywords: "gold medal first win" },
  { char: "🏆", keywords: "trophy win champion" },
  { char: "⏱️", keywords: "stopwatch time lap" },
  { char: "🛞", keywords: "wheel tyre tire" },
  { char: "⛽", keywords: "fuel pit stop" },
  { char: "🚦", keywords: "lights start race" },
  { char: "🔥", keywords: "fire hot fast" },
  { char: "💨", keywords: "fast speed dash" },
  { char: "😂", keywords: "laugh funny lol" },
  { char: "😅", keywords: "sweat nervous relief" },
  { char: "😭", keywords: "cry sad tears" },
  { char: "😱", keywords: "shock scream surprised" },
  { char: "🤯", keywords: "mind blown shocked" },
  { char: "😤", keywords: "frustrated angry huff" },
  { char: "🙃", keywords: "upside down silly" },
  { char: "😎", keywords: "cool sunglasses" },
  { char: "🤔", keywords: "thinking hmm" },
  { char: "👀", keywords: "eyes looking watching" },
  { char: "❤️", keywords: "heart love" },
  { char: "💔", keywords: "heartbreak sad" },
  { char: "👍", keywords: "thumbs up good yes" },
  { char: "👎", keywords: "thumbs down bad no" },
  { char: "👏", keywords: "clap applause" },
  { char: "🙌", keywords: "hands up celebrate" },
  { char: "🤝", keywords: "handshake deal" },
  { char: "✅", keywords: "check yes correct" },
  { char: "❌", keywords: "cross no wrong" },
  { char: "⚠️", keywords: "warning caution" },
  { char: "💯", keywords: "hundred perfect" },
  { char: "📈", keywords: "chart up gain" },
  { char: "📉", keywords: "chart down loss" },
  { char: "🎉", keywords: "party celebrate confetti" },
  { char: "🍾", keywords: "champagne celebrate podium" },
  { char: "🇮🇹", keywords: "italy monza flag" },
  { char: "🇬🇧", keywords: "britain silverstone flag" },
  { char: "🇲🇨", keywords: "monaco flag" },
];

/** Positioned absolute within whatever the caller's own `relative` wrapper is (the composer's
 * toolbar row) - not portaled to document.body, unlike this app's other floating popovers. Those
 * need fixed/viewport-based positioning because they escape scrolling containers (a table, a
 * grid); a composer toolbar is a small, static, non-scrolling area, so a plain CSS-anchored
 * popover is simpler and correct here without rect math. */
export function EmojiPicker({ onSelect, onClose }: { onSelect: (emoji: string) => void; onClose: () => void }) {
  const [query, setQuery] = useState("");
  // Lazy initializer, not an effect - reads localStorage exactly once, on mount, with no extra
  // render in between (an effect calling setState right after mount is the cascading-render
  // pattern React's own lint rule flags).
  const [recent, setRecent] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem("f1hub_recent_emoji");
      return stored ? JSON.parse(stored) : [];
    } catch {
      // localStorage unavailable (private mode, blocked) - recents just start empty, not fatal.
      return [];
    }
  });
  const rootRef = useRef<HTMLDivElement>(null);

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

  function pick(char: string) {
    onSelect(char);
    const next = [char, ...recent.filter((r) => r !== char)].slice(0, 8);
    setRecent(next);
    try {
      localStorage.setItem("f1hub_recent_emoji", JSON.stringify(next));
    } catch {
      // best-effort only
    }
  }

  const q = query.trim().toLowerCase();
  const filtered = q ? EMOJI.filter((e) => e.keywords.includes(q)) : EMOJI;

  return (
    <AnimatePresence>
      <motion.div
        ref={rootRef}
        initial={{ opacity: 0, y: 4, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.98 }}
        transition={{ duration: 0.12 }}
        className="absolute bottom-full z-[150] mb-2 w-64 rounded-lg border border-[var(--f1-line)] bg-[var(--tooltip-surface-strong)] p-2 backdrop-blur-md"
      >
        <input
          autoFocus
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search emoji..."
          className="w-full rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-600 focus:outline-none"
        />
        {!q && recent.length > 0 && (
          <>
            <p className="mb-1 mt-2 px-0.5 text-[10px] font-semibold uppercase tracking-wide text-neutral-500">Recent</p>
            <div className="grid grid-cols-8 gap-0.5">
              {recent.map((char) => (
                <button key={char} type="button" onClick={() => pick(char)} className="flex h-7 w-7 items-center justify-center rounded text-base hover:bg-white/[0.06]">
                  {char}
                </button>
              ))}
            </div>
          </>
        )}
        <div className="mt-2 grid max-h-40 grid-cols-8 gap-0.5 overflow-y-auto">
          {filtered.map((e) => (
            <button key={e.char} type="button" onClick={() => pick(e.char)} title={e.keywords.split(" ")[0]} className="flex h-7 w-7 items-center justify-center rounded text-base hover:bg-white/[0.06]">
              {e.char}
            </button>
          ))}
          {filtered.length === 0 && <p className="col-span-8 py-3 text-center text-xs text-neutral-600">No matches.</p>}
        </div>
      </motion.div>
    </AnimatePresence>
  );
}
