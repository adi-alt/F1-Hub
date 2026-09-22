"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";

export type RoleValue = "admin" | "moderator" | null;

export const ROLE_OPTIONS: { value: RoleValue; label: string; hint: string }[] = [
  { value: "admin", label: "Admin", hint: "Full access, including roles and pipeline runs" },
  { value: "moderator", label: "Moderator", hint: "Can view users and moderate picks" },
  { value: null, label: "Member", hint: "Standard account, no admin surfaces" },
];

export function roleLabel(role: RoleValue): string {
  return ROLE_OPTIONS.find((o) => o.value === role)?.label ?? "Member";
}

type Rect = { top: number; left: number; width: number; flip: boolean };

const PANEL_HEIGHT = 3 * 52 + 8;

/**
 * The per-row role control. Replaces the two/three loose "Make moderator" / "Make admin" /
 * "Remove" buttons this table used to carry in every row: those made the row's *current* state
 * something you inferred from which buttons were absent, grew the row wider the fewer privileges
 * a user had, and offered no single place to see what the alternatives even were.
 *
 * A select states the current value and the full set of choices in one control of fixed width.
 * The panel is portaled to document.body and positioned with `fixed` coordinates from the
 * trigger's own rect — the table body is an `overflow-auto` scroll container, so a panel rendered
 * in-flow would be clipped by it on the last few rows (the exact reason Nexus's own table
 * dropdown portals too). Flips above the trigger when there isn't room below.
 */
export function RoleSelect({
  value,
  onChange,
  disabled = false,
  pending = false,
  disabledReason,
}: {
  value: RoleValue;
  onChange: (role: RoleValue) => void;
  disabled?: boolean;
  pending?: boolean;
  /** Shown as the control's tooltip when `disabled` — never leave a dead control unexplained. */
  disabledReason?: string;
}) {
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<Rect | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  function updatePosition() {
    const el = triggerRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const flip = r.bottom + PANEL_HEIGHT > window.innerHeight && r.top - PANEL_HEIGHT > 0;
    setRect({ top: flip ? r.top : r.bottom + 4, left: r.left, width: Math.max(r.width, 208), flip });
  }

  useLayoutEffect(() => {
    if (!open) return;
    updatePosition();
    // capture:true — scroll events don't bubble, so a listener on window only sees the table
    // body's own scroll on the way *down* to it. Without this the panel detaches from its row
    // the moment the table scrolls underneath it.
    window.addEventListener("scroll", updatePosition, { capture: true, passive: true });
    window.addEventListener("resize", updatePosition);
    return () => {
      window.removeEventListener("scroll", updatePosition, { capture: true });
      window.removeEventListener("resize", updatePosition);
    };
  }, [open]);

  // Not useOnClickOutside: that checks a single ref, and the panel is portaled outside the
  // trigger's subtree, so clicking an option would read as "outside" and close the panel before
  // the option's own onClick ever fired.
  useLayoutEffect(() => {
    if (!open) return;
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target) || panelRef.current?.contains(target)) return;
      setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const isLocked = disabled || pending;

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        disabled={isLocked}
        title={disabled ? disabledReason : undefined}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Role: ${roleLabel(value)}`}
        onClick={() => setOpen((v) => !v)}
        className={`flex h-8 w-full min-w-[128px] items-center justify-between gap-2 rounded-lg border px-2.5 text-xs transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)] ${
          isLocked
            ? "cursor-not-allowed border-[var(--f1-line)] text-neutral-500 opacity-60"
            : "border-[var(--f1-line)] text-neutral-200 hover:border-white/25 hover:text-white"
        }`}
      >
        <span className="truncate">{pending ? "Saving…" : roleLabel(value)}</span>
        <svg
          viewBox="0 0 20 20"
          fill="none"
          aria-hidden
          className={`h-3 w-3 shrink-0 text-neutral-500 transition-transform duration-200 ${open ? "rotate-180" : ""}`}
        >
          <path d="m5 7.5 5 5 5-5" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </button>

      {typeof document !== "undefined" &&
        createPortal(
          <AnimatePresence>
            {open && rect && (
              <motion.div
                ref={panelRef}
                role="listbox"
                initial={{ opacity: 0, y: rect.flip ? -4 : 4, scale: 0.98 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: rect.flip ? -4 : 4, scale: 0.98 }}
                transition={{ duration: 0.14, ease: "easeOut" }}
                style={{
                  position: "fixed",
                  top: rect.top,
                  left: rect.left,
                  width: rect.width,
                  transform: rect.flip ? "translateY(calc(-100% - 4px))" : undefined,
                }}
                className="glass-surface z-[200] overflow-hidden rounded-lg"
              >
                {ROLE_OPTIONS.map((opt) => {
                  const selected = opt.value === value;
                  return (
                    <button
                      key={opt.label}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      onClick={() => {
                        setOpen(false);
                        if (!selected) onChange(opt.value);
                      }}
                      className={`block w-full px-3 py-2 text-left transition ${
                        selected ? "bg-[var(--f1-red)]/[0.12] text-white" : "text-neutral-300 hover:bg-white/[0.06] hover:text-white"
                      }`}
                    >
                      <span className="flex items-center justify-between gap-2 text-xs font-medium">
                        {opt.label}
                        {selected && <span className="text-[var(--f1-red)]">✓</span>}
                      </span>
                      <span className="mt-0.5 block text-[11px] leading-snug text-neutral-500">{opt.hint}</span>
                    </button>
                  );
                })}
              </motion.div>
            )}
          </AnimatePresence>,
          document.body,
        )}
    </>
  );
}
