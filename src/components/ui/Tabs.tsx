"use client";

import { useId, useRef } from "react";
import { motion } from "framer-motion";

export type TabItem = { key: string; label: string };

/** Generic pill-capsule tab bar - visually modeled on `src/components/profile/PersonalizationTabs.tsx`
 * (the sliding Framer Motion capsule look already established there), but built as a plain
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
export function Tabs({
  items,
  activeKey,
  onChange,
  layoutId,
  panelId,
}: {
  items: TabItem[];
  activeKey: string;
  onChange: (key: string) => void;
  layoutId: string;
  /** Base id for the associated tabpanel(s) - each tab button gets `aria-controls={panelId}` and
   * `id={`${panelId}-tab-${key}`}`; the caller's panel should set `id={panelId}` and
   * `aria-labelledby` to the active tab's id. */
  panelId: string;
}) {
  const reactId = useId();
  const groupId = `tabs-${reactId}`;
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
      className="flex gap-1 overflow-x-auto rounded-full border border-[var(--f1-line)] bg-black/20 p-1 scrollbar-hide"
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
            id={`${groupId}-tab-${item.key}`}
            aria-selected={isActive}
            aria-controls={`${panelId}-tab-${item.key}`}
            tabIndex={isActive ? 0 : -1}
            onClick={() => onChange(item.key)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className="relative shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition sm:text-sm"
          >
            {isActive && (
              <motion.div
                layoutId={layoutId}
                className="absolute inset-0 rounded-full bg-[var(--f1-red)]"
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
