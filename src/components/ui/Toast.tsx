"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useReducer, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CircleCheck, Info, TriangleAlert, X, type LucideIcon } from "lucide-react";

export type ToastTone = "info" | "success" | "warning" | "danger";

/** What show() takes. */
export type ToastInput = {
  /** One sentence, sentence case. */
  message: string;
  description?: string;
  /** Default "info". */
  tone?: ToastTone;
  /** An action slot, e.g. an Undo button. A toast with an action stays until dismissed. */
  action?: ReactNode;
  /** Pass an existing toast's id to replace it in place ("Saving…" then "Saved"). */
  id?: string;
};

export type Toast = Omit<ToastInput, "id" | "tone"> & { id: string; tone: ToastTone };

export type ToastAction = { type: "show"; toast: Toast } | { type: "dismiss"; id: string };

export type ToastApi = {
  /** Shows a toast and returns its id. */
  show: (toast: ToastInput) => string;
  dismiss: (id: string) => void;
};

/** How long an ordinary toast stays up. */
export const TOAST_DURATION_MS = 5000;
/** The most toasts on screen at once. */
export const MAX_TOASTS = 3;

/**
 * The auto-dismiss rule: 5 s, except errors and toasts with an action, which stay until dismissed.
 * An action on a timer can expire before a keyboard or screen reader user reaches it (WCAG 2.2.1).
 * Timers also pause while the stack is hovered or holds focus.
 */
export function toastDuration(toast: Pick<Toast, "tone" | "action">): number | null {
  return toast.tone === "danger" || toast.action ? null : TOAST_DURATION_MS;
}

/**
 * The queue. `show` appends a toast, or replaces the one with the same id where it stands; past
 * MAX_TOASTS it drops the oldest toast that would time out anyway, and drops a persistent one
 * only when there is nothing else. The toast being shown is never the one dropped. `dismiss`
 * removes by id, and returns the same array when there is nothing to remove.
 */
export function toastReducer(toasts: Toast[], action: ToastAction): Toast[] {
  switch (action.type) {
    case "show": {
      const { toast } = action;
      if (toasts.some((t) => t.id === toast.id)) return toasts.map((t) => (t.id === toast.id ? toast : t));
      const next = [...toasts, toast];
      while (next.length > MAX_TOASTS) {
        const transient = next.findIndex((t, i) => i < next.length - 1 && toastDuration(t) !== null);
        next.splice(transient === -1 ? 0 : transient, 1);
      }
      return next;
    }
    case "dismiss":
      return toasts.some((t) => t.id === action.id) ? toasts.filter((t) => t.id !== action.id) : toasts;
  }
}

const TONES: Record<ToastTone, { icon: LucideIcon; color: string; label?: string }> = {
  info: { icon: Info, color: "text-info" },
  success: { icon: CircleCheck, color: "text-success" },
  // The icon is aria-hidden, so the tones that change what the message means say so in words.
  warning: { icon: TriangleAlert, color: "text-warning", label: "Warning:" },
  danger: { icon: CircleAlert, color: "text-danger", label: "Error:" },
};

const ToastContext = createContext<ToastApi | null>(null);

/**
 * Holds the toast queue and renders the notifications region. Mount it once near the root; call
 * useToast() anywhere below it.
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, dispatch] = useReducer(toastReducer, []);
  const nextId = useRef(0);

  const show = useCallback((input: ToastInput) => {
    nextId.current += 1;
    const id = input.id ?? `toast-${nextId.current}`;
    dispatch({ type: "show", toast: { ...input, id, tone: input.tone ?? "info" } });
    return id;
  }, []);
  const dismiss = useCallback((id: string) => dispatch({ type: "dismiss", id }), []);
  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <ToastContext value={api}>
      {children}
      <ToastRegion toasts={toasts} onDismiss={dismiss} />
    </ToastContext>
  );
}

/** `show(toast)` returns the new toast's id; `dismiss(id)` removes it. Throws outside ToastProvider. */
export function useToast(): ToastApi {
  const api = useContext(ToastContext);
  if (!api) throw new Error("useToast() needs a <ToastProvider> above it.");
  return api;
}

/**
 * The notifications region ToastProvider renders: bottom-centre on phones, bottom-right from md
 * up, on z-toast. It is a polite live region that is always in the DOM, even when empty, so the
 * first toast is announced. Exported for server rendering and tests; in the app, use the provider.
 */
export function ToastRegion({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  return (
    <section aria-label="Notifications" aria-live="polite" className="pointer-events-none fixed inset-x-0 bottom-0 z-toast flex justify-center p-4 md:justify-end">
      {/* Only mounted while there are toasts, so its hover and focus state starts fresh each time:
          a toast dismissed from under the pointer or focus leaves no leave or blur event behind. */}
      {toasts.length > 0 && <ToastList toasts={toasts} onDismiss={onDismiss} />}
    </section>
  );
}

function ToastList({ toasts, onDismiss }: { toasts: Toast[]; onDismiss: (id: string) => void }) {
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused;

  return (
    <ol
      className="flex w-full max-w-sm flex-col gap-2"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget)) setFocused(false);
      }}
    >
      {toasts.map((toast) => (
        <ToastItem key={toast.id} toast={toast} paused={paused} onDismiss={onDismiss} />
      ))}
    </ol>
  );
}

function ToastItem({ toast, paused, onDismiss }: { toast: Toast; paused: boolean; onDismiss: (id: string) => void }) {
  const duration = toastDuration(toast);

  // Keyed on the toast object, so replacing a toast in place restarts its timer.
  useEffect(() => {
    if (duration === null || paused) return;
    const timer = window.setTimeout(() => onDismiss(toast.id), duration);
    return () => window.clearTimeout(timer);
  }, [toast, duration, paused, onDismiss]);

  const tone = TONES[toast.tone];
  const Icon = tone.icon;

  return (
    <li className="pointer-events-auto flex items-start gap-3 rounded-card bg-surface-3 p-4 text-body-sm text-primary shadow-overlay transition-[opacity,translate] duration-base ease-standard starting:translate-y-2 starting:opacity-0 motion-reduce:transition-none">
      <Icon aria-hidden size={20} strokeWidth={1.75} className={`shrink-0 ${tone.color}`} />
      <div className="min-w-0 flex-1">
        <p className="break-words">
          {tone.label && <span className="sr-only">{tone.label} </span>}
          {toast.message}
        </p>
        {toast.description && <p className="mt-1 break-words text-secondary">{toast.description}</p>}
        {toast.action ? <div className="mt-3 flex flex-wrap gap-2">{toast.action}</div> : null}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        onClick={() => onDismiss(toast.id)}
        className="-m-1.5 flex size-8 shrink-0 items-center justify-center rounded-control text-secondary hover:bg-primary/8 hover:text-primary focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
      >
        <X aria-hidden size={16} strokeWidth={1.75} />
      </button>
    </li>
  );
}
