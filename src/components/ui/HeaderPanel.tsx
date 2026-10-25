"use client";

import {
  useLayoutEffect,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "motion/react";
import { useModalFocusTrap } from "@/hooks/useModalFocusTrap";

// The panel's frosted look - a real translucent dark glass (~50% tint, not glass-surface's ~93-95% opaque gradient,
// which reads as a flat zinc slab at this size) plus a strong blur+saturate so blurred page colour shows through. The
// caret copies every one of these through CSS `inherit`, so panel and caret always read as one surface.
const FROSTED_STYLE = {
  backgroundColor: "rgba(22, 22, 26, 0.5)",
  backdropFilter: "blur(32px) saturate(160%)",
  WebkitBackdropFilter: "blur(32px) saturate(160%)",
  borderColor: "rgba(255, 255, 255, 0.16)",
} as const;

/** Gap between the header's bottom edge and the panel, and the least room kept to the viewport's edges. */
const GAP = 8;
const CARET = 14;

type Place = { top: number; right: number; caretRight: number };

/**
 * The header's floating window (the account menu, the notification centre): one width, one frosted surface, one
 * motion. Its right edge lines up with its trigger's, it sits a fixed gap below the header (not the trigger), it never
 * leaves the viewport, and a caret points back at the trigger's centre.
 *
 * Portalled to <body>: the header has its own backdrop-filter, and a descendant's backdrop-filter only samples inside
 * that "backdrop root", so a panel left inside <header> could never blur the page beneath it. Being portalled, Tab
 * would skip it, so the focus trap moves focus in, keeps it there, closes on Escape and returns focus to the trigger.
 */
export function HeaderPanel({
  open,
  onClose,
  anchorRef,
  id,
  label,
  children,
}: {
  open: boolean;
  onClose: () => void;
  /** The trigger: the panel aligns to it and clicks on it don't count as outside. */
  anchorRef: RefObject<HTMLElement | null>;
  id?: string;
  label?: string;
  children: ReactNode;
}) {
  const [place, setPlace] = useState<Place | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  useModalFocusTrap(panelRef, open && place !== null, onClose, {
    lockScroll: false,
  });

  useLayoutEffect(() => {
    if (!open) return;
    function update() {
      const el = anchorRef.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      const header = el.closest("header")?.getBoundingClientRect();
      const right = Math.max(GAP, window.innerWidth - r.right);
      // The caret's centre on the trigger's centre, measured from the panel's right edge.
      const caretRight =
        window.innerWidth - right - (r.left + r.width / 2) - CARET / 2;
      setPlace({
        top: (header?.bottom ?? r.bottom) + GAP,
        right,
        caretRight: Math.max(12, caretRight),
      });
    }
    update();
    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (
        anchorRef.current?.contains(target) ||
        panelRef.current?.contains(target)
      )
        return;
      onClose();
    }
    window.addEventListener("scroll", update, { capture: true, passive: true });
    window.addEventListener("resize", update);
    document.addEventListener("mousedown", onPointerDown);
    return () => {
      window.removeEventListener("scroll", update, { capture: true });
      window.removeEventListener("resize", update);
      document.removeEventListener("mousedown", onPointerDown);
    };
  }, [open, anchorRef, onClose]);

  if (!place) return null;
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          key="header-panel"
          ref={panelRef}
          id={id}
          role="dialog"
          aria-label={label}
          initial={{ opacity: 0, y: -6, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -6, scale: 0.98 }}
          transition={{ duration: 0.15, ease: "easeOut" }}
          style={{
            position: "fixed",
            top: place.top,
            right: place.right,
            transformOrigin: `calc(100% - ${place.caretRight + CARET / 2}px) 0`,
          }}
          className="z-[200] w-[min(22rem,calc(100vw-1rem))]"
        >
          <div
            className="relative rounded-xl border shadow-2xl shadow-black/50"
            style={FROSTED_STYLE}
          >
            {/* A rotated square with only its outer two edges bordered, clipped to the half above the panel (plus a
                sliver that covers the panel's own top edge), so no border runs inside the caret. */}
            <div
              aria-hidden
              className="absolute -top-[7px] size-3.5 rotate-45 rounded-tl-[2px] border-l border-t"
              style={{
                right: place.caretRight,
                clipPath: "polygon(0 0, 100% 0, 100% 15%, 15% 100%, 0 100%)",
                backgroundColor: "inherit",
                backdropFilter: "inherit",
                WebkitBackdropFilter: "inherit",
                borderColor: "inherit",
              }}
            />
            <div
              className="relative flex flex-col overflow-hidden rounded-xl"
              style={{ maxHeight: `calc(100dvh - ${place.top + GAP}px)` }}
            >
              {children}
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
