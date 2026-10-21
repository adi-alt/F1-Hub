"use client";

import { useEffect, useRef, useState } from "react";
import { Button } from "./Button";

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
    // A caller's own resting look (a text link inside a card) wins; otherwise it's the app's small secondary button.
    if (className)
      return (
        <button type="button" disabled={disabled || pending} onClick={() => setArmed(true)} className={className}>
          {pending ? "Working…" : children}
        </button>
      );
    return (
      <Button variant="secondary" size="sm" disabled={disabled} loading={pending} onClick={() => setArmed(true)}>
        {children}
      </Button>
    );
  }

  return (
    <span ref={wrapRef} className="inline-flex flex-wrap items-center gap-2" role="group" aria-label={question}>
      <span className="text-caption text-secondary">{question}</span>
      <Button
        ref={confirmRef}
        variant="danger"
        size="sm"
        loading={pending}
        onClick={() => {
          setArmed(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </Button>
      <Button variant="ghost" size="sm" onClick={() => setArmed(false)}>
        Cancel
      </Button>
    </span>
  );
}
