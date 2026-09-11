"use client";

import { useEffect, useRef, useState, useSyncExternalStore } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

type Rect = { top?: number; bottom?: number; left: number; minWidth: number; maxHeight: number };

/**
 * A portal-anchored popover panel: the primitive behind Discover's Topics filter, a community's
 * "Joined" menu, and member row actions.
 *
 * Same positioning discipline as Picker (measure real available space, cap height to what fits,
 * anchor a flipped panel by `bottom` rather than a transform framer-motion would discard) but
 * without any selection model of its own - the caller renders whatever belongs inside. That's the
 * difference from Picker: Picker *is* a select, this is a place to put things.
 *
 * Escape closes, click-outside closes, and focus returns to the trigger on close.
 */
export function Popover({
  trigger,
  children,
  align = "start",
  panelClassName = "",
  ariaLabel,
}: {
  /** Gets `open` so the caller can render its own chevron/active state. */
  trigger: (props: { open: boolean; toggle: () => void; ref: React.Ref<HTMLButtonElement> }) => React.ReactNode;
  /** Gets `close` so an action inside the panel can dismiss it. */
  children: (props: { close: () => void }) => React.ReactNode;
  align?: "start" | "end";
  panelClassName?: string;
  ariaLabel?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const [refocusSignal, setRefocusSignal] = useState(0);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  // Defers the portal to the client without touching document.body during SSR - same real crash
  // EntityMultiSelect documents at length.
  const isClient = useSyncExternalStore(
    () => () => {},
    () => true,
    () => false,
  );

  // Ref reads live in an effect, never in a render-time closure (React's refs-during-render rule).
  useEffect(() => {
    if (refocusSignal === 0) return;
    triggerRef.current?.focus();
  }, [refocusSignal]);

  function close() {
    setOpen(false);
    setRefocusSignal((n) => n + 1);
  }

  useEffect(() => {
    if (!open) return;

    function updatePosition() {
      const el = triggerRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const margin = 8;
      const spaceBelow = window.innerHeight - r.bottom - margin;
      const spaceAbove = r.top - margin;
      const flip = spaceBelow < 260 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(160, Math.min(380, flip ? spaceAbove : spaceBelow));
      const minWidth = Math.max(r.width, 220);
      const left = align === "end" ? Math.max(margin, r.right - minWidth) : Math.min(r.left, window.innerWidth - minWidth - margin);
      setRect(flip ? { bottom: window.innerHeight - r.top, left, minWidth, maxHeight } : { top: r.bottom + 6, left, minWidth, maxHeight });
    }

    updatePosition();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    window.addEventListener("scroll", updatePosition, { capture: true, passive: true });
    window.addEventListener("resize", updatePosition);
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", updatePosition, { capture: true });
      window.removeEventListener("resize", updatePosition);
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, align]);

  return (
    <>
      {trigger({ open, toggle: () => (open ? close() : setOpen(true)), ref: triggerRef })}
      {isClient &&
        createPortal(
          <AnimatePresence>
            {open && rect && (
              <motion.div
                ref={panelRef}
                role="dialog"
                aria-label={ariaLabel}
                initial={{ opacity: 0, y: -4, scale: 0.99 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -4, scale: 0.99 }}
                transition={{ duration: 0.12 }}
                style={{ position: "fixed", top: rect.top, bottom: rect.bottom, left: rect.left, minWidth: rect.minWidth, maxHeight: rect.maxHeight, zIndex: 120 }}
                className={`flex flex-col overflow-hidden rounded-xl border border-white/10 bg-zinc-900/95 shadow-2xl backdrop-blur-xl ${panelClassName}`}
              >
                {children({ close })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}

/** The standard pill trigger for a filter popover - shared so Topics/Sort/Filter all read as one
 * control family rather than three slightly different buttons. */
export function FilterPill({
  label,
  count,
  open,
  onClick,
  buttonRef,
}: {
  label: string;
  /** Shown as a badge when non-zero - "Topics 2" is the only honest way to signal an active filter
   * without listing every selection in the trigger. */
  count?: number;
  open: boolean;
  onClick: () => void;
  buttonRef: React.Ref<HTMLButtonElement>;
}) {
  const active = (count ?? 0) > 0;
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onClick}
      aria-expanded={open}
      className={`flex shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium transition ${
        active || open ? "border-white/25 bg-white/[0.06] text-white" : "border-[var(--f1-line)] text-neutral-400 hover:border-white/20 hover:text-neutral-200"
      }`}
    >
      {label}
      {active && <span className="rounded-full bg-[var(--f1-red)] px-1.5 text-[10px] font-semibold text-white tabular-nums">{count}</span>}
      <svg viewBox="0 0 20 20" className={`h-3 w-3 text-neutral-500 transition ${open ? "rotate-180" : ""}`} fill="none" aria-hidden>
        <path d="M5 7.5 10 12.5 15 7.5" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </button>
  );
}
