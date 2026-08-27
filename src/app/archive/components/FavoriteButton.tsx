"use client";

import { motion } from "framer-motion";

// Controlled, not self-fetching: ArchiveExplorer owns the favorited Sets and persistence so
// state survives a tab switch (this button would otherwise re-mount with stale props every time
// its tab becomes active again — see ArchiveExplorer's toggleFavorite).
export function FavoriteButton({
  favorited,
  onToggle,
  className = "",
}: {
  favorited: boolean;
  onToggle: () => void;
  className?: string;
}) {
  return (
    <button
      type="button"
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        onToggle();
      }}
      aria-label={favorited ? "Remove from favorites" : "Add to favorites"}
      aria-pressed={favorited}
      className={`inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full transition hover:bg-white/10 ${className}`}
    >
      {/* key={favorited} replays this tiny spring pop every time the real toggle below actually
          flips - a visual flourish on an already-correct callback, not new wiring of its own. */}
      <motion.svg
        key={favorited ? "on" : "off"}
        viewBox="0 0 24 24"
        className="h-[18px] w-[18px]"
        fill={favorited ? "var(--f1-red)" : "none"}
        initial={{ scale: 0.6 }}
        animate={{ scale: 1 }}
        whileTap={{ scale: 0.8 }}
        transition={{ type: "spring", stiffness: 400, damping: 15 }}
      >
        <path
          d="M21 8.25c0-2.485-2.099-4.5-4.688-4.5-1.935 0-3.597 1.126-4.312 2.733-.715-1.607-2.377-2.733-4.313-2.733C5.1 3.75 3 5.765 3 8.25c0 7.22 9 12 9 12s9-4.78 9-12Z"
          stroke={favorited ? "var(--f1-red)" : "currentColor"}
          strokeWidth="1.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </motion.svg>
    </button>
  );
}
