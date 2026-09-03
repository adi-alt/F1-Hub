"use client";

import { useLayoutEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
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

type Rect = { top?: number; bottom?: number; left: number; width: number; flip: boolean; maxHeight: number };

/** A compact select popover: trigger reads "{n} selected" (multi) or the chosen entity's name
 * (single), opens a portaled dropdown with search and a grouped option list. Built for
 * Progression's Custom mode (multi, with select all/clear all and checkboxes) and reused by
 * Compare's driver/team pickers (`multiple={false}` - single click selects and closes, no
 * checkbox row) so both controls share one visual language instead of this one looking like a
 * polished popover and Compare's looking like a plain text input with a native focus ring. Kept
 * as its own component rather than generalizing SearchableSelect.tsx (still used, unmodified in
 * spirit, by the signup flow): a purpose-built component here is less risk than threading a very
 * different interaction model through code something else already relies on. Same portal/
 * position/click-outside pattern as SearchableSelect, so it behaves consistently either way. */
export function EntityMultiSelect({
  options,
  selected,
  onChange,
  favoriteCodes,
  placeholder = "Select",
  multiple = true,
  triggerClassName = "",
  surfaceClassName = "glass-surface",
}: {
  options: MultiSelectOption[];
  selected: string[];
  onChange: (codes: string[]) => void;
  favoriteCodes?: Set<string>;
  placeholder?: string;
  multiple?: boolean;
  /** Appended to the trigger button's own classes - e.g. Archive's compact filters pass a fixed
   * `h-9` so the trigger lines up with the search input/FilterPill's own height in that row.
   * Compare/Progression (unset) keep their existing natural sizing. */
  triggerClassName?: string;
  /** The dropdown panel's own background/border treatment - defaults to `.glass-surface` (Compare/
   * Progression's look, unchanged). Archive's own filter pickers override this to the flat
   * translucent zinc surface Archive standardized on (table/cards/tooltip) - a scoped override,
   * not a change to glass-surface itself or its default here, so this stays exactly as it was
   * everywhere else this component is used. */
  surfaceClassName?: string;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [rect, setRect] = useState<Rect | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  // createPortal's own container argument (document.body, below) is evaluated unconditionally as a
  // plain function argument the instant this component renders - `open && rect && <AnimatePresence>`
  // only gates the portal's *content*, not the createPortal(...) call itself, so document.body still
  // got referenced during SSR (where `document` doesn't exist) even while closed - a real crash, not
  // a hypothetical one, confirmed live on /archive (its era filter renders this on the very first,
  // default facet). useSyncExternalStore's server snapshot (false) defers the whole portal to the
  // client without ever touching document.body server-side - React's own recommended shape for
  // exactly this "differs between server and client" case, and unlike a useEffect+setState "mounted"
  // flag, without an extra render. AnimatePresence itself never unmounts across an open/close toggle
  // (only its children come and go), so the close animation is unaffected.
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

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

  // Same trigger, same dropdown, wherever it's used (Race Analysis' shared filter, Simulation's
  // own Finishing Position Distribution filter, Progression, Compare) - any difference in how
  // reliably it opens is purely a function of *where on the page* a given trigger happens to sit,
  // not the component. This used to guess a single fixed 360px height for the flip decision,
  // which broke exactly the way a hardcoded estimate always does: fine near the top of the page
  // (usually genuine room below), unreliable near the bottom (Finishing Position Distribution
  // sits much lower than Race Analysis' own filter, so it hits the cramped case far more often in
  // practice) - not two different dropdowns, the same fragile estimate under different real
  // conditions. Measuring the *actual* available space in each direction and capping the
  // dropdown's own height to whatever genuinely fits (never a blind 360px) means it can never
  // overflow the viewport regardless of where the trigger sits, and only flips upward when doing
  // so actually gains real room - not just because "below" doesn't fit a fixed guess.
  //
  // Anchored via `bottom` (not `top` + a manual `transform: translateY(-100%)`) when flipped -
  // confirmed live that the transform trick never actually worked, at any trigger position: this
  // element is a `motion.div` animating its own `y`/`scale` (the open/close micro-motion), and
  // framer-motion owns the whole `transform` property the instant any motion value drives it,
  // silently discarding a same-element `style.transform` set outside its own animation props
  // (verified via the rendered DOM: `transform: none` even with flip correctly computed true).
  // `bottom`, unlike `transform`, is a completely different CSS property framer-motion never
  // touches, and a fixed-position box anchored by `bottom` grows upward from that edge on its own
  // as content height changes - no need to also know the exact pixel height up front.
  function updatePosition() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const margin = 8; // breathing room from the viewport edge, so the dropdown never sits flush against it
    const spaceBelow = window.innerHeight - r.bottom - margin;
    const spaceAbove = r.top - margin;
    const flip = spaceBelow < 240 && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, Math.min(360, flip ? spaceAbove : spaceBelow));
    setRect(
      flip
        ? { bottom: window.innerHeight - r.top, left: r.left, width: Math.max(r.width, 260), flip, maxHeight }
        : { top: r.bottom, left: r.left, width: Math.max(r.width, 260), flip, maxHeight },
    );
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
    if (!multiple) {
      onChange([code]);
      // Not close() - that also refocuses the trigger, which fights the click that's already
      // landing here (Escape's own handler still goes through close() for that same
      // return-focus-to-trigger behavior, where it's actually wanted).
      setOpen(false);
      setQuery("");
      return;
    }
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
  const selectedOption = !multiple ? options.find((o) => o.code === selected[0]) : undefined;
  const triggerLabel = multiple ? (count > 0 ? `${count} selected` : placeholder) : (selectedOption?.label ?? placeholder);

  return (
    // Progression's Custom trigger stays compact (inline-block, sized to its own label);
    // Compare's driver/team pickers need to fill their half of the "A vs B" row instead of
    // shrink-wrapping to whatever name happens to be selected - `multiple` already tells the two
    // apart (Progression is always multi, Compare is always single), so this doesn't need its own
    // separate prop.
    <div ref={rootRef} className={`relative ${multiple ? "inline-block" : "block w-full"}`}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm font-medium transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] ${multiple ? "" : "w-full"} ${
          // Red is an "actively open" state, not a "has a value" one - a single-select trigger
          // (Compare) almost always has a value, so tying the accent to count>0 left it
          // permanently red instead of only highlighting while the popover is actually open.
          open ? "border-[var(--f1-red)]/50 bg-[var(--f1-red)]/10 text-white" : "border-white/10 bg-white/[0.02] text-neutral-300 hover:text-white"
        } ${triggerClassName}`}
      >
        <span className={`truncate ${count === 0 ? "text-neutral-500" : ""}`}>{triggerLabel}</span>
        <svg width="10" height="10" viewBox="0 0 10 10" fill="none" className={`shrink-0 transition-transform duration-150 ${open ? "rotate-180" : ""}`}>
          <path d="M2 3.5 5 6.5 8 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {isClient &&
        createPortal(
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
                  bottom: rect.bottom,
                  left: rect.left,
                  width: rect.width,
                  maxHeight: rect.maxHeight,
                }}
                // surfaceClassName defaults to glass-surface (see this prop's own doc comment for
                // why that's right here) - Archive overrides it to match its own flat translucent
                // surface instead. max-height is inline (rect.maxHeight, the real measured
                // available space), not a fixed Tailwind class - that fixed 360px is exactly what
                // let this overflow the viewport whenever less than 360px was actually available.
                className={`${surfaceClassName} z-[200] flex flex-col overflow-hidden rounded-lg`}
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
                {multiple && (
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
                )}
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
                              role={multiple ? "checkbox" : "option"}
                              aria-checked={multiple ? checked : undefined}
                              aria-selected={multiple ? undefined : checked}
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
