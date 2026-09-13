"use client";

import { useEffect, useRef, useState } from "react";

/**
 * A destructive action that asks first, in place - replacing `window.confirm()`, which this app
 * still used for "remove member" and which is an OS-rendered modal that ignores every surface
 * style here, can't be styled or themed, and blocks the whole tab.
 *
 * Deliberately inline rather than a portal/dialog: these live inside member rows and settings
 * sections where a full modal for "remove one person" is heavier than the action warrants. The
 * confirm step swaps the button for a short question plus Yes/Cancel, auto-cancels on Escape or
 * blur, and never fires the action without a second, explicit click.
 */
export function ConfirmButton({
  onConfirm,
  children,
  confirmLabel = "Confirm",
  question = "Are you sure?",
  className = "",
  disabled = false,
  pending = false,
}: {
  onConfirm: () => void;
  /** The resting-state label. */
  children: React.ReactNode;
  confirmLabel?: string;
  question?: string;
  className?: string;
  disabled?: boolean;
  /** Shows the action as in-flight and blocks a second submission. */
  pending?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  const wrapRef = useRef<HTMLSpanElement>(null);
  const confirmRef = useRef<HTMLButtonElement>(null);

  // Focus lands on the confirm button so a keyboard user isn't stranded, and the whole armed state
  // is one Escape away from gone.
  useEffect(() => {
    if (!armed) return;
    confirmRef.current?.focus();
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setArmed(false);
    }
    function onPointerDown(e: MouseEvent) {
      if (!wrapRef.current?.contains(e.target as Node)) setArmed(false);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [armed]);

  if (!armed) {
    return (
      <button
        type="button"
        disabled={disabled || pending}
        onClick={() => setArmed(true)}
        className={className || "text-xs text-neutral-600 transition hover:text-[var(--f1-red)] disabled:opacity-40"}
      >
        {pending ? "Working…" : children}
      </button>
    );
  }

  return (
    <span ref={wrapRef} className="inline-flex items-center gap-2 text-xs" role="group" aria-label={question}>
      <span className="text-neutral-400">{question}</span>
      <button
        ref={confirmRef}
        type="button"
        disabled={pending}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
        className="font-semibold text-[var(--f1-red)] transition hover:brightness-125 disabled:opacity-40"
      >
        {confirmLabel}
      </button>
      <button type="button" onClick={() => setArmed(false)} className="text-neutral-500 transition hover:text-white">
        Cancel
      </button>
    </span>
  );
}
