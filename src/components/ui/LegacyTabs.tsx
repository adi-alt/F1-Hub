"use client";

import { useRef } from "react";
import { motion } from "framer-motion";

export type TabItem = { key: string; label: string };

/** Generic segmented tab bar - visually modeled on `src/components/profile/PersonalizationTabs.tsx`
 * (the sliding Framer Motion indicator look already established there, restyled from a stadium pill
 * to a structured rounded-rectangle segment per the shape-system pass), but built as a plain
 * **controlled** component from the start (no internal state) since both real call sites (Your F1's
 * cockpit, the Apex Intelligence workspace) need their active tab driven from a parent that's ALSO
 * set from elsewhere on the page (the hero radar, the floating Apex widget's quick-jump buttons) -
 * an uncontrolled component couldn't support that.
 *
 * Two things this adds beyond the reference component, both needed because this becomes a shared
 * primitive mounted twice on the same page at once:
 * - `layoutId` is a required prop, not hardcoded - two simultaneously-mounted instances sharing one
 *   `layoutId` would fight over the same Framer Motion shared-layout animation.
 * - Real APG tab semantics (`role="tablist"`/`"tab"`/`"tabpanel"`, `aria-selected`, `aria-controls`,
 *   left/right arrow-key roving focus) - the reference component has none of this.
 *
 * Deliberately does NOT animate panel height on tab change (see callers) - only this bar's own
 * sliding capsule animates; content crossfade is the caller's responsibility via AnimatePresence. */
/** The id of the tab for `key`, for its panel's aria-labelledby. */
export function tabIdFor(panelId: string, key: string): string {
  return `${panelId}-tab-${key}`;
}

export function Tabs({
  items,
  activeKey,
  onChange,
  layoutId,
  panelId,
  className = "",
}: {
  items: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  layoutId: string;
  /** Base id for the associated tabpanel(s) - each tab button gets `aria-controls={panelId}` and
   * `id={`${panelId}-tab-${key}`}`; the caller's panel should set `id={panelId}` and
   * `aria-labelledby` to the active tab's id (`tabIdFor(panelId, activeKey)`). Leave it out for a
   * strip that switches what something else shows rather than a panel of its own: the tabs then
   * point at nothing, which is better than at an id that doesn't exist. */
  panelId?: string;
  /** Extra classes on the tablist container. Exists for one real need: a caller placing this in a
   * row beside other controls (the Users page's filter/search/invite row) has to be able to pin it
   * to that row's own height, which padding alone can't do. Height set here flows through because
   * the buttons are flex children of a stretch container, so they fill whatever it is; callers that
   * pass nothing keep the previous intrinsic sizing exactly. */
  className?: string;
}) {
  const buttonRefs = useRef<Record<string, HTMLButtonElement | null>>({});

  function focusAndActivate(key: string) {
    onChange(key);
    buttonRefs.current[key]?.focus();
  }

  function onKeyDown(e: React.KeyboardEvent, index: number) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") return;
    e.preventDefault();
    let nextIndex = index;
    if (e.key === "ArrowRight") nextIndex = (index + 1) % items.length;
    else if (e.key === "ArrowLeft") nextIndex = (index - 1 + items.length) % items.length;
    else if (e.key === "Home") nextIndex = 0;
    else if (e.key === "End") nextIndex = items.length - 1;
    focusAndActivate(items[nextIndex].key);
  }

  return (
    <div
      role="tablist"
      aria-orientation="horizontal"
      className={`flex gap-1 overflow-x-auto rounded-lg border border-[var(--f1-line)] bg-black/20 p-1 scrollbar-hide ${className}`}
    >
      {items.map((item, i) => {
        const isActive = item.key === activeKey;
        return (
          <button
            key={item.key}
            ref={(el) => {
              buttonRefs.current[item.key] = el;
            }}
            type="button"
            role="tab"
            // As documented above. These used to be `tabs-${useId()}-tab-${key}` and
            // `${panelId}-tab-${key}`, neither of which any panel could point back at (audit UI-31).
            id={panelId ? tabIdFor(panelId, item.key) : undefined}
            aria-selected={isActive}
            aria-controls={panelId}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className="relative inline-flex shrink-0 items-center justify-center whitespace-nowrap rounded-md px-3.5 py-1.5 text-xs font-medium transition sm:text-sm"
          >
            {isActive && (
              <motion.div
                layoutId={layoutId}
                className="absolute inset-0 rounded-md bg-[var(--f1-red)]"
                transition={{ type: "spring", bounce: 0.2, duration: 0.5 }}
              />
            )}
            <span className={`relative z-10 ${isActive ? "text-white" : "text-neutral-400 hover:text-white"}`}>
              {item.label}
            </span>
          </button>
        );
      })}
    </div>
  );
}
