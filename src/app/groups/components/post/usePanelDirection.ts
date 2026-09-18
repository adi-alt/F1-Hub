"use client";

import { useEffect, useState, type CSSProperties, type RefObject } from "react";

/**
 * Fixed-viewport coordinates for a panel anchored to a trigger.
 *
 * The composer's Emoji, GIF and Apex panels were absolutely positioned inside the composer itself,
 * which sits inside the centre column's own `overflow-y-auto` scroll container - so they were
 * CLIPPED by it and appeared to slide under the feed instead of floating over it. No z-index fixes
 * that: a scroll container clips its descendants regardless of stacking order. The panel has to
 * leave the container entirely, which means a portal to document.body and real viewport
 * coordinates, which is what this computes.
 *
 * Same positioning discipline as the shared Popover primitive: measure the real anchor, prefer
 * opening downward, flip up only when down genuinely doesn't fit, cap the height to the space
 * actually available, and clamp horizontally so the panel can never hang off either edge.
 * Re-measured on scroll (capture: true, so it also catches the inner column scrolling, not just the
 * window) and on resize.
 */
export function useAnchoredPanel(anchorRef: RefObject<HTMLElement | null>, width: number, estimatedHeight: number): CSSProperties | null {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useEffect(() => {
    function measure() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const margin = 8;
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const openDown = spaceBelow >= estimatedHeight || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(180, Math.min(estimatedHeight, openDown ? spaceBelow : spaceAbove));
      const left = Math.min(Math.max(margin, rect.left), Math.max(margin, window.innerWidth - width - margin));

      setStyle(
        openDown
          ? { position: "fixed", top: rect.bottom + 6, left, width, maxHeight, zIndex: 150 }
          : { position: "fixed", bottom: window.innerHeight - rect.top + 6, left, width, maxHeight, zIndex: 150 },
      );
    }

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, { capture: true });
    };
  }, [anchorRef, width, estimatedHeight]);

  return style;
}
