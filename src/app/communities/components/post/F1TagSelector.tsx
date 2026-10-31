"use client";

import { useState, useRef, useEffect, type RefObject } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { Flag, Sparkles, User, Users, X } from "lucide-react";
import { F1_DRIVER_TAGS, F1_SESSION_TAGS, F1_TEAM_TAGS, type F1Tag, type F1TagCategory } from "@/lib/communities";
import { F1TagChip } from "./F1TagChip";
import { useAnchoredPanel } from "./usePanelDirection";

const MAX_TAGS = 3;

export function F1TagSelector({
  anchorRef,
  tags,
  onChange,
  onClose,
  upcomingRaces = [],
}: {
  anchorRef: RefObject<HTMLElement | null>;
  tags: F1Tag[];
  onChange: (tags: F1Tag[]) => void;
  onClose: () => void;
  upcomingRaces?: { id?: string; raceId?: string; round?: number; name: string }[];
}) {
  const [activeCategory, setActiveCategory] = useState<F1TagCategory>("session");
  const [search, setSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      const target = e.target as Node;
      if (
        rootRef.current &&
        !rootRef.current.contains(target) &&
        anchorRef.current &&
        !anchorRef.current.contains(target)
      ) {
        onClose();
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose, anchorRef]);

  const gpTags: F1Tag[] = upcomingRaces.map((r) => ({
    category: "grand_prix",
    id: r.id || r.raceId || `round_${r.round ?? 0}`,
    label: r.name,
  }));

  const allAvailableTags: F1Tag[] =
    activeCategory === "session"
      ? F1_SESSION_TAGS
      : activeCategory === "driver"
        ? F1_DRIVER_TAGS
        : activeCategory === "team"
          ? F1_TEAM_TAGS
          : gpTags;

  const filteredTags = search.trim()
    ? allAvailableTags.filter((t) => t.label.toLowerCase().includes(search.trim().toLowerCase()))
    : allAvailableTags;

  function toggleTag(tag: F1Tag) {
    const exists = tags.some((t) => t.category === tag.category && t.id === tag.id);
    if (exists) {
      onChange(tags.filter((t) => !(t.category === tag.category && t.id === tag.id)));
    } else {
      if (tags.length >= MAX_TAGS) return;
      onChange([...tags, tag]);
    }
  }

  const style = useAnchoredPanel(anchorRef, 300, 360);
  if (typeof document === "undefined" || !style) return null;

  return createPortal(
    <AnimatePresence>
      <motion.div
        ref={rootRef}
        initial={{ opacity: 0, y: 4, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 4, scale: 0.98 }}
        transition={{ duration: 0.12 }}
        style={style}
        className="z-[250] flex flex-col w-[300px] rounded-card border border-white/12 bg-surface-1/95 p-3 shadow-2xl backdrop-blur-xl"
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-white/8 pb-2">
          <div className="min-w-0">
            <span className="text-body-sm font-semibold text-primary">Tag F1 Topic</span>
            <span className="ml-2 text-[11px] text-tertiary">({tags.length}/{MAX_TAGS})</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close tag picker"
            className="rounded-control p-1 text-tertiary hover:bg-white/[0.08] hover:text-primary transition-colors"
          >
            <X className="size-3.5" />
          </button>
        </div>

        {/* Category Tabs */}
        <div className="mt-2.5 grid grid-cols-4 gap-1 p-0.5 bg-black/30 rounded-lg text-[11px]">
          <button
            type="button"
            onClick={() => {
              setActiveCategory("session");
              setSearch("");
            }}
            className={`flex items-center justify-center gap-1 py-1 rounded-md transition-colors ${
              activeCategory === "session" ? "bg-white/15 text-primary font-medium shadow-sm" : "text-secondary hover:text-primary"
            }`}
          >
            <Flag className="size-2.5" />
            <span>Session</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveCategory("driver");
              setSearch("");
            }}
            className={`flex items-center justify-center gap-1 py-1 rounded-md transition-colors ${
              activeCategory === "driver" ? "bg-white/15 text-primary font-medium shadow-sm" : "text-secondary hover:text-primary"
            }`}
          >
            <User className="size-2.5" />
            <span>Driver</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveCategory("team");
              setSearch("");
            }}
            className={`flex items-center justify-center gap-1 py-1 rounded-md transition-colors ${
              activeCategory === "team" ? "bg-white/15 text-primary font-medium shadow-sm" : "text-secondary hover:text-primary"
            }`}
          >
            <Users className="size-2.5" />
            <span>Team</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveCategory("grand_prix");
              setSearch("");
            }}
            className={`flex items-center justify-center gap-1 py-1 rounded-md transition-colors ${
              activeCategory === "grand_prix" ? "bg-white/15 text-primary font-medium shadow-sm" : "text-secondary hover:text-primary"
            }`}
          >
            <Sparkles className="size-2.5" />
            <span>GP</span>
          </button>
        </div>

        {/* Search input for drivers/teams/GPs */}
        {(activeCategory === "driver" || activeCategory === "team" || activeCategory === "grand_prix") && (
          <div className="mt-2">
            <input
              type="text"
              placeholder={`Search ${activeCategory === "grand_prix" ? "Grand Prix" : activeCategory}...`}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full rounded-control border border-white/10 bg-white/[0.04] px-2.5 py-1 text-caption text-primary placeholder-tertiary focus:border-brand focus:outline-none"
            />
          </div>
        )}

        {/* Tags List */}
        <div className="mt-2 max-h-48 overflow-y-auto space-y-1 pr-0.5">
          {filteredTags.length === 0 ? (
            <p className="p-3 text-center text-caption text-tertiary">No matching {activeCategory}s</p>
          ) : (
            filteredTags.map((tag) => {
              const selected = tags.some((t) => t.category === tag.category && t.id === tag.id);
              return (
                <button
                  key={`${tag.category}-${tag.id}`}
                  type="button"
                  disabled={!selected && tags.length >= MAX_TAGS}
                  onClick={() => toggleTag(tag)}
                  className={`w-full flex items-center justify-between rounded-control px-2.5 py-1.5 text-caption transition-colors ${
                    selected
                      ? "bg-brand/15 text-brand font-medium border border-brand/35"
                      : tags.length >= MAX_TAGS
                        ? "opacity-40 cursor-not-allowed text-secondary"
                        : "text-secondary hover:bg-white/[0.07] hover:text-primary"
                  }`}
                >
                  <F1TagChip tag={tag} size="xs" />
                  <span className="text-[11px] text-tertiary">{selected ? "Selected" : "+ Add"}</span>
                </button>
              );
            })
          )}
        </div>

        <p className="mt-2 text-center text-[10px] text-tertiary">
          Tagged posts can be filtered by community members.
        </p>
      </motion.div>
    </AnimatePresence>,
    document.body,
  );
}
