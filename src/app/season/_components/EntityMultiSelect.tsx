"use client";

import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import { EntityAvatar } from "@/components/EntityAvatar";

export type MultiSelectOption = {
  code: string;
  label: string;
  /** Driver's team, shown as small trailing text. Not used for constructors (the row already
   * shows a team, being one). */
  sublabel?: string;
  /** Grouping key, e.g. a driver's team - entities with the same group render under one heading. */
  group?: string;
  /** Small color dot when there's no logo (drivers) - real team color, not an arbitrary palette. */
  color?: string;
  /** Team logo (constructors); left unset for drivers. */
  logoUrl?: string | null;
};

type Rect = { top: number; left: number; width: number; flip: boolean };

/** A compact multi-select popover: trigger reads "{n} selected", opens a portaled dropdown with
 * search, select all/clear all, and a grouped, checkable option list. Replaces Progression's old
 * always-visible pill row for Custom mode - the same problem (many options, one control) that
 * SearchableSelect.tsx already solves for a *single* choice, extended here for multiple. Kept as
 * its own component rather than generalizing SearchableSelect itself: ComparePanel depends on that
 * component's single-select behavior, and a purpose-built sibling is less risk than threading a
 * multi-value mode through code something else already relies on. Same portal/position/click-
 * outside pattern as SearchableSelect, so it behaves consistently with the rest of the app. */
export function EntityMultiSelect({
  options,
  selected,
  onChange,
  favoriteCodes,
  placeholder = "Select",
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (codes: string[]) => void;
  favoriteCodes?: Set<string>;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState<Rect | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  const selectedSet = useMemo(() => new Set(selected), [selected]);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return options;
    return options.filter((o) => o.label.toLowerCase().includes(q) || o.sublabel?.toLowerCase().includes(q));
  }, [options, query]);

  // Favorites first (if any are favorited and still match the search), then the rest grouped by
  // `group` (a driver's team) in the order options were given - standings order, not alphabetical,
  // so a group's own drivers still read P-then-P the way the rest of the page orders everything.
  const groups = useMemo(() => {
    const favs = favoriteCodes && favoriteCodes.size > 0 ? filtered.filter((o) => favoriteCodes.has(o.code)) : [];
    const favCodeSet = new Set(favs.map((o) => o.code));
    const rest = filtered.filter((o) => !favCodeSet.has(o.code));
    const byGroup = new Map<string, MultiSelectOption[]>();
    for (const o of rest) {
      const key = o.group ?? "";
      const list = byGroup.get(key);
      if (list) list.push(o);
      else byGroup.set(key, [o]);
    }
    const out: { heading: string | null; options: MultiSelectOption[] }[] = [];
    if (favs.length > 0) out.push({ heading: "Favorites", options: favs });
    for (const [key, list] of byGroup) out.push({ heading: key || null, options: list });
    return out;
  }, [filtered, favoriteCodes]);

  function updatePosition() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const estimatedHeight = 360;
    const flip = r.bottom + estimatedHeight > window.innerHeight && r.top - estimatedHeight > 0;
    setRect({ top: flip ? r.top : r.bottom, left: r.left, width: Math.max(r.width, 260), flip });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    // capture:true so a scroll on any ancestor (not just window) still repositions this - same
    // reasoning as SearchableSelect.tsx.
    window.addEventListener("scroll", updatePosition, { capture: true, passive: true });
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, { capture: true });
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  useLayoutEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target) || dropdownRef.current?.contains(target)) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [open]);

  function close() {
    setOpen(false);
    setQuery("");
    triggerRef.current?.focus();
  }

  function toggle(code: string) {
    onChange(selectedSet.has(code) ? selected.filter((c) => c !== code) : [...selected, code]);
  }
  function selectAll() {
    onChange([...new Set([...selected, ...filtered.map((o) => o.code)])]);
  }
  function clearAll() {
    const filteredCodes = new Set(filtered.map((o) => o.code));
    onChange(selected.filter((c) => !filteredCodes.has(c)));
  }

  const count = selected.length;

  return (
    <div ref={rootRef} className="relative inline-block">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center gap-2 rounded-lg border px-3 py-1.5 text-sm font-medium transition ${
          open || count > 0 ? "border-[var(--f1-red)]/50 bg-[var(--f1-red)]/10 text-white" : "border-white/10 bg-white/[0.02] text-neutral-400 hover:text-white"
        }`}
      >
        <span>{count > 0 ? `${count} selected` : placeholder}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}>
          <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {createPortal(
        <AnimatePresence>
          {open && rect && (
            <motion.div
              ref={dropdownRef}
              initial={{ opacity: 0, y: rect.flip ? -4 : 4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: rect.flip ? -4 : 4, scale: 0.98 }}
              transition={{ duration: 0.14, ease: "easeOut" }}
              style={{
                position: "fixed",
                top: rect.top,
                left: rect.left,
                width: rect.width,
                transform: rect.flip ? "translateY(-100%)" : undefined,
                background: "var(--tooltip-surface-strong)",
              }}
              className="z-[200] flex max-h-[360px] flex-col overflow-hidden rounded-lg border border-[var(--f1-line)] shadow-xl backdrop-blur-md"
            >
              <div className="shrink-0 border-b border-white/[0.08] p-2">
                <input
                  autoFocus
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Escape" && close()}
                  placeholder="Search..."
                  className="w-full rounded-md border border-white/10 bg-white/[0.03] px-2.5 py-1.5 text-xs text-white placeholder:text-neutral-600 focus:outline-none focus:ring-1 focus:ring-[var(--f1-red)]/40"
                />
              </div>
              <div className="flex shrink-0 items-center justify-between border-b border-white/[0.06] px-3 py-1.5 text-[11px] font-medium text-neutral-500">
                <button type="button" onClick={selectAll} className="transition hover:text-white">
                  Select all
                </button>
                <span className="text-neutral-700">
                  {count} of {options.length}
                </span>
                <button type="button" onClick={clearAll} className="transition hover:text-white">
                  Clear all
                </button>
              </div>
              <div className="scrollbar-hide flex-1 overflow-y-auto py-1">
                {groups.length === 0 ? (
                  <p className="px-3 py-4 text-center text-xs text-neutral-500">No matches</p>
                ) : (
                  groups.map((g) => (
                    <div key={g.heading ?? "_"}>
                      {g.heading && <p className="px-3 pb-1 pt-2 text-[10px] font-semibold uppercase tracking-wide text-neutral-600">{g.heading}</p>}
                      {g.options.map((o) => {
                        const checked = selectedSet.has(o.code);
                        return (
                          <button
                            key={o.code}
                            type="button"
                            role="checkbox"
                            aria-checked={checked}
                            onClick={() => toggle(o.code)}
                            className={`flex w-full items-center gap-2.5 px-3 py-1.5 text-left text-sm transition ${
                              checked ? "bg-[var(--f1-red)]/[0.12] text-white" : "text-neutral-300 hover:bg-white/[0.04] hover:text-white"
                            }`}
                          >
                            <span
                              className={`flex h-4 w-4 shrink-0 items-center justify-center rounded border transition ${
                                checked ? "border-[var(--f1-red)] bg-[var(--f1-red)]" : "border-white/20"
                              }`}
                            >
                              {checked && (
                                <svg width="9" height="7" viewBox="0 0 9 7" fill="none">
                                  <path d="M1 3.5 3.2 5.7 8 1" stroke="white" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
                                </svg>
                              )}
                            </span>
                            {o.logoUrl !== undefined ? (
                              <EntityAvatar imageUrl={o.logoUrl} name={o.label} size={18} shape="square" fit="contain" />
                            ) : o.color ? (
                              <span className="h-2 w-2 shrink-0 rounded-full" style={{ background: o.color }} />
                            ) : null}
                            <span className="min-w-0 flex-1 truncate">{o.label}</span>
                            {o.sublabel && <span className="shrink-0 truncate text-xs text-neutral-500">{o.sublabel}</span>}
                          </button>
                        );
                      })}
                    </div>
                  ))
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>,
        document.body,
      )}
    </div>
  );
}
