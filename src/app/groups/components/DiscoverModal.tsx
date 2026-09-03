"use client";

import { createPortal } from "react-dom";
import { motion } from "framer-motion";
import { DiscoverGroupsTab } from "./DiscoverGroupsTab";

/** Discover Groups is no longer its own page/tab (the request's own "do not create separate My
 * Groups / Discover Groups pages" point) - it's reached from the left sidebar's "Discover
 * Communities" button and the right sidebar's "View all" link, both opening this same modal.
 * DiscoverGroupsTab itself is unchanged - same search, same real public-groups query, same Join
 * flow - just given a modal shell (matching CreateGroupModal's own portal/backdrop pattern)
 * instead of a full page. */
export function DiscoverModal({ onClose }: { onClose: () => void }) {
  return createPortal(
    <div className="fixed inset-0 z-[100] flex items-start justify-center overflow-y-auto bg-black/35 px-4 py-8" onClick={onClose}>
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        exit={{ opacity: 0, scale: 0.98 }}
        transition={{ duration: 0.15 }}
        onClick={(e) => e.stopPropagation()}
        className="relative w-full max-w-4xl rounded-2xl border border-white/10 bg-zinc-900/80 p-6 shadow-2xl backdrop-blur-xl"
      >
        <button
          onClick={onClose}
          aria-label="Close"
          className="absolute right-4 top-4 flex h-8 w-8 items-center justify-center rounded-full bg-black/40 text-white/70 transition hover:bg-black/60 hover:text-white"
        >
          <svg viewBox="0 0 20 20" className="h-4 w-4" fill="none" aria-hidden>
            <path d="M5 5 L15 15 M15 5 L5 15" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </button>
        <DiscoverGroupsTab />
      </motion.div>
    </div>,
    document.body,
  );
}
