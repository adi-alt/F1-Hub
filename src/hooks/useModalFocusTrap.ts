import { useCallback, useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = 'a[href], button:not([disabled]), input, select, textarea, [tabindex]:not([tabindex="-1"])';

/**
 * The three things a floating window has to get right, extracted from the season page's own
 * RaceQuickView (the first place this app built a real modal correctly) so a second floating
 * surface doesn't reimplement - or skip - any of them:
 *
 *  - focus moves into the panel on open, and is restored to whatever triggered it on close
 *  - Tab is trapped inside the panel (wraps at both ends) so it can never reach the page behind it
 *  - Escape closes it, and the actual scrolling region freezes while it's open
 *
 * Scroll-locking targets `[data-app-scroll]`, not `document.body` - this app's root layout makes
 * body itself `overflow-hidden` (SmoothScroll owns the one real scrolling element inside it), so a
 * conventional `document.body.style.overflow = "hidden"` would silently do nothing here.
 *
 * `panelRef` is created and attached by the caller (to whichever element is the actual dialog
 * surface) rather than returned, since the caller already owns that ref for its own layout/portal
 * needs.
 */
export function useModalFocusTrap(panelRef: RefObject<HTMLElement | null>, isOpen: boolean, onClose: () => void) {
  const restoreFocusRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    restoreFocusRef.current = document.activeElement as HTMLElement | null;
    return () => {
      restoreFocusRef.current?.focus?.();
    };
  }, [isOpen]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        onClose();
        return;
      }
      if (e.key !== "Tab" || !panelRef.current) return;
      const items = Array.from(panelRef.current.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => el.offsetParent !== null);
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    },
    [onClose, panelRef],
  );

  useEffect(() => {
    if (!isOpen) return;
    document.addEventListener("keydown", onKeyDown, true);

    const scroller = document.querySelector<HTMLElement>("[data-app-scroll]");
    const previousOverflow = scroller?.style.overflow ?? "";
    if (scroller) scroller.style.overflow = "hidden";

    // Only steals focus to the panel's first focusable element as a fallback - a caller with its
    // own more specific `autoFocus` (Discover's search input, say) already put focus somewhere
    // inside the panel by the time this runs, and forcing it back to "first focusable in DOM
    // order" would silently override that with a worse choice (often just the close button).
    const timer = window.setTimeout(() => {
      if (panelRef.current?.contains(document.activeElement)) return;
      panelRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    }, 0);

    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      if (scroller) scroller.style.overflow = previousOverflow;
      window.clearTimeout(timer);
    };
  }, [isOpen, onKeyDown, panelRef]);
}
