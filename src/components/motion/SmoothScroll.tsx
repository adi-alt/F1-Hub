"use client";

import { useEffect } from "react";
import Lenis from "lenis";

/** Mounted once in the root layout — owns the whole page's scroll physics, not a per-section
 * thing. No visual output; just drives the requestAnimationFrame loop Lenis needs. */
export function SmoothScroll() {
  useEffect(() => {
    const lenis = new Lenis();
    let frame: number;
    function raf(time: number) {
      lenis.raf(time);
      frame = requestAnimationFrame(raf);
    }
    frame = requestAnimationFrame(raf);
    return () => {
      cancelAnimationFrame(frame);
      lenis.destroy();
    };
  }, []);

  return null;
}
