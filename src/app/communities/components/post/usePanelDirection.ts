"use client";

import { useLayoutEffect, useState, type CSSProperties, type RefObject } from "react";

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
 * Measured when the panel opens and followed while it stays open, so scrolling, resizing and the composer
 * growing underneath all keep it attached.
 */
/** Below the app header's own z-50 on purpose: an anchored panel is attached to content, so it
 * should slide UNDER the sticky header as the page scrolls rather than float over the site's
 * primary navigation. Still far above normal flow, so it covers the feed as intended. */
const PANEL_Z = 40;

export function useAnchoredPanel(
  anchorRef: RefObject<HTMLElement | null>,
  width: number,
  estimatedHeight: number,
  { open = true, align = "start" }: { open?: boolean; align?: "start" | "end" } = {},
): CSSProperties | null {
  const [style, setStyle] = useState<CSSProperties | null>(null);

  useLayoutEffect(() => {
    if (!open) return;
    let last = "";
    function measure() {
      const el = anchorRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const margin = 8;
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      const openDown = spaceBelow >= estimatedHeight || spaceBelow >= spaceAbove;
      const maxHeight = Math.max(180, Math.min(estimatedHeight, openDown ? spaceBelow : spaceAbove));
      // "end" lines the panel's right edge up with the trigger's, for a control at the right of its row (Post's
      // schedule caret), so the panel stays over the composer instead of hanging out over the rail beside it.
      const preferred = align === "end" ? rect.right - width : rect.left;
      const left = Math.min(Math.max(margin, preferred), Math.max(margin, window.innerWidth - width - margin));
      const next: CSSProperties = openDown
        ? { position: "fixed", top: rect.bottom + 6, left, width, maxHeight, zIndex: PANEL_Z }
        : { position: "fixed", bottom: window.innerHeight - rect.top + 6, left, width, maxHeight, zIndex: PANEL_Z };
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setStyle(next);
      }
    }

    // Measured when the panel opens, not when its trigger mounts: the composer grows as it's written in (the
    // textarea, the call builder, an error line), so a position taken earlier points at where the button used to
    // be - which is how the Apex menu ended up over its own toolbar. While open it follows the trigger every frame
    // (state only changes when the position does), so a layout shift underneath can't strand it either.
    measure();
    let frame = requestAnimationFrame(function follow() {
      measure();
      frame = requestAnimationFrame(follow);
    });
    return () => cancelAnimationFrame(frame);
  }, [anchorRef, width, estimatedHeight, open, align]);

  return open ? style : null;
}
