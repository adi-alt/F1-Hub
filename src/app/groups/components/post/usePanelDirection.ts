"use client";

import { useEffect, useRef, useState } from "react";

/**
 * Which way an absolutely-positioned panel should open from its anchor.
 *
 * The composer's Emoji and GIF panels were both hardcoded to `bottom-full` - always upward,
 * regardless of where the toolbar actually sat. In the Communities workspace the composer is at the
 * TOP of the centre column, so "always up" is the one direction with no room, and the panel opened
 * clipped against the header every time.
 *
 * Measured from the panel's own offsetParent (the caller's `relative` toolbar, which is the real
 * anchor) after layout, so this reflects where the control genuinely is rather than where the
 * component assumed it would be. Re-measured on scroll and resize because the composer lives inside
 * an independently-scrolling column - its distance to the viewport edges changes without the window
 * ever resizing.
 *
 * Returns a ref to put on the panel and the direction to render it in. Down is preferred whenever
 * it fits; when neither side fits outright, the roomier side wins so the largest usable portion
 * stays on screen.
 */
export function usePanelDirection(estimatedHeight: number) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [direction, setDirection] = useState<"up" | "down">("down");

  useEffect(() => {
    function measure() {
      const anchor = panelRef.current?.offsetParent;
      if (!(anchor instanceof HTMLElement)) return;
      const rect = anchor.getBoundingClientRect();
      const height = panelRef.current?.offsetHeight || estimatedHeight;
      const margin = 12;
      const spaceBelow = window.innerHeight - rect.bottom - margin;
      const spaceAbove = rect.top - margin;
      setDirection(spaceBelow >= height || spaceBelow >= spaceAbove ? "down" : "up");
    }

    measure();
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, { capture: true, passive: true });
    return () => {
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, { capture: true });
    };
  }, [estimatedHeight]);

  return { panelRef, direction, positionClass: direction === "down" ? "top-full mt-2" : "bottom-full mb-2" };
}
