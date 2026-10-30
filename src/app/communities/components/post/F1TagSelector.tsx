"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown, Flag, Plus, ShieldAlert, Sparkles, User, Users } from "lucide-react";
import { F1_DRIVER_TAGS, F1_SESSION_TAGS, F1_TEAM_TAGS, type F1Tag, type F1TagCategory } from "@/lib/communities";
import { F1TagChip } from "./F1TagChip";

const MAX_TAGS = 3;

export function F1TagSelector({
  tags,
  onChange,
  isSpoiler,
  onSpoilerChange,
  upcomingRaces = [],
}: {
  tags: F1Tag[];
  onChange: (tags: F1Tag[]) => void;
  isSpoiler: boolean;
  onSpoilerChange: (isSpoiler: boolean) => void;
  upcomingRaces?: { id?: string; raceId?: string; round?: number; name: string }[];
}) {
  const [open, setOpen] = useState(false);
  const [activeCategory, setActiveCategory] = useState<F1TagCategory>("session");
  const [search, setSearch] = useState("");
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [open]);

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

  function removeTag(tag: F1Tag) {
    onChange(tags.filter((t) => !(t.category === tag.category && t.id === tag.id)));
  }

  return (
    <div className="space-y-2">
      {/* Attached Tags + Add Tag + Spoiler Toggle */}
      <div className="flex flex-wrap items-center gap-1.5 text-caption">
        {tags.map((tag) => (
          <F1TagChip key={`${tag.category}-${tag.id}`} tag={tag} onRemove={() => removeTag(tag)} />
        ))}

        {tags.length < MAX_TAGS && (
          <div className="relative inline-block" ref={popoverRef}>
            <button
              type="button"
              onClick={() => setOpen((prev) => !prev)}
              className="inline-flex items-center gap-1 rounded-control border border-dashed border-white/18 bg-white/[0.03] px-2 py-0.5 text-caption text-secondary hover:border-white/35 hover:bg-white/[0.08] hover:text-primary transition-colors"
              aria-expanded={open}
            >
              <Plus className="size-3" />
              <span>Tag F1 entity</span>
              <ChevronDown className="size-3 text-tertiary" />
            </button>

            {open && (
              <div className="absolute left-0 bottom-full mb-1.5 z-40 w-72 rounded-xl border border-white/12 bg-surface-1/95 p-2 shadow-2xl backdrop-blur-xl animate-in fade-in zoom-in-95 duration-100">
                <div className="flex items-center justify-between border-b border-white/8 pb-1.5 mb-2 px-1">
                  <span className="text-caption font-semibold text-primary">Tag F1 Topic ({tags.length}/3)</span>
                  <span className="text-[11px] text-tertiary">Select up to 3</span>
                </div>

                {/* Category Tabs */}
                <div className="grid grid-cols-4 gap-1 p-0.5 bg-black/30 rounded-lg mb-2 text-[11px]">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveCategory("session");
                      setSearch("");
                    }}
                    className={`flex items-center justify-center gap-1 py-1 rounded-md transition-colors ${
                      activeCategory === "session" ? "bg-white/15 text-primary font-medium" : "text-secondary hover:text-primary"
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
                      activeCategory === "driver" ? "bg-white/15 text-primary font-medium" : "text-secondary hover:text-primary"
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
                      activeCategory === "team" ? "bg-white/15 text-primary font-medium" : "text-secondary hover:text-primary"
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
                      activeCategory === "grand_prix" ? "bg-white/15 text-primary font-medium" : "text-secondary hover:text-primary"
                    }`}
                  >
                    <Sparkles className="size-2.5" />
                    <span>GP</span>
                  </button>
                </div>

                {/* Search input for drivers/teams */}
                {(activeCategory === "driver" || activeCategory === "team") && (
                  <div className="mb-2">
                    <input
                      type="text"
                      placeholder={`Search ${activeCategory}...`}
                      value={search}
                      onChange={(e) => setSearch(e.target.value)}
                      className="w-full rounded-md border border-white/10 bg-white/[0.04] px-2 py-1 text-caption text-primary placeholder-tertiary focus:border-brand focus:outline-none"
                    />
                  </div>
                )}

                {/* Tags List */}
                <div className="max-h-48 overflow-y-auto space-y-1 p-0.5">
                  {filteredTags.length === 0 ? (
                    <p className="p-2 text-center text-caption text-tertiary">No matching {activeCategory}s</p>
                  ) : (
                    filteredTags.map((tag) => {
                      const selected = tags.some((t) => t.category === tag.category && t.id === tag.id);
                      return (
                        <button
                          key={`${tag.category}-${tag.id}`}
                          type="button"
                          disabled={!selected && tags.length >= MAX_TAGS}
                          onClick={() => toggleTag(tag)}
                          className={`w-full flex items-center justify-between rounded-lg px-2 py-1 text-caption transition-colors ${
                            selected
                              ? "bg-brand/20 text-brand font-medium border border-brand/40"
                              : tags.length >= MAX_TAGS
                                ? "opacity-40 cursor-not-allowed text-secondary"
                                : "text-secondary hover:bg-white/[0.08] hover:text-primary"
                          }`}
                        >
                          <F1TagChip tag={tag} size="xs" />
                          <span className="text-[11px] text-tertiary">{selected ? "Selected" : "+ Add"}</span>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            )}
          </div>
        )}

        {/* Spoiler Shield Checkbox / Button */}
        <button
          type="button"
          onClick={() => onSpoilerChange(!isSpoiler)}
          aria-pressed={isSpoiler}
          className={`inline-flex items-center gap-1.5 rounded-control px-2 py-0.5 text-caption font-medium transition-colors ml-auto ${
            isSpoiler
              ? "bg-amber-500/20 border border-amber-500/40 text-amber-300"
              : "border border-white/10 bg-white/[0.03] text-secondary hover:border-white/20 hover:text-primary"
          }`}
          title="Blur post content until clicked by the reader"
        >
          <ShieldAlert className={`size-3.5 ${isSpoiler ? "text-amber-400" : "text-secondary"}`} />
          <span>Spoiler Shield {isSpoiler ? "ON" : ""}</span>
        </button>
      </div>
    </div>
  );
}
