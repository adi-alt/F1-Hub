"use client";

import { useCallback } from "react";

/**
 * Times a line's draw-in (globals.css .line-reveal) to when it's seen, not to the page load. A line already on screen
 * when the page loads keeps drawing from the load, untouched (nothing changes after hydration, so nothing flickers);
 * one further down is held back (data-reveal="wait") and drawn when it scrolls into view (data-reveal="play").
 * Only where the draw-in runs at all: a desktop with motion (the CSS sits in the rich-motion media query).
 */
export function useLineReveal<T extends Element>() {
  return useCallback((el: T | null) => {
    if (!el || typeof IntersectionObserver === "undefined") return;
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) return;
    el.setAttribute("data-reveal", "wait");
    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          el.setAttribute("data-reveal", "play");
          io.disconnect();
        }
      },
      { threshold: 0.4 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);
}
