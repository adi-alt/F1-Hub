"use client";

import { useEffect, useState, type RefObject } from "react";

/**
 * How many rows of a table fit between where the table starts and the bottom of the window, so a paged table fills
 * the screen without the page scrolling: (window height - the table's top - the chrome around the rows) / row height,
 * clamped to [min, max]. The table's top is taken in page coordinates, so scrolling doesn't change the answer;
 * resizing the window (or the content above the table changing height) does, through a ResizeObserver on the page.
 * Starts at `initial` so the server render and the first client render agree.
 */
export function useFitRows(
  ref: RefObject<HTMLElement | null>,
  { rowHeight, chrome, min = 5, max = 25, initial = 10 }: { rowHeight: number; chrome: number; min?: number; max?: number; initial?: number },
): number {
  const [rows, setRows] = useState(initial);

  useEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const fit = Math.floor((window.innerHeight - top - chrome) / rowHeight);
      setRows(Math.min(max, Math.max(min, fit)));
    };
    // A ResizeObserver fires once on observe and again whenever the page's layout height changes, which covers the
    // window resizing and the header or filters above the table changing height.
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref, rowHeight, chrome, min, max]);

  return rows;
}
