"use client";

import { useEffect, useState, type RefObject } from "react";

/** The page's breathing room under the pagination row, in px. */
const BOTTOM_GAP = 20;

/**
 * How many rows of a table fit between where the table starts and the bottom of the window, so a paged table fills
 * the screen and pages instead of scrolling. Measured, not guessed: the table's top (in page coordinates, so
 * scrolling doesn't change the answer), its header row, a real body row, and whatever follows the table inside its
 * parent (the pagination). `rowHeight` is only the first guess, before a row exists to measure. Re-measured when the
 * window resizes or the page's height changes (a filter row wrapping, the header above changing). Starts at
 * `initial` so the server render and the first client render agree.
 */
export function useFitRows(
  ref: RefObject<HTMLElement | null>,
  { rowHeight, min = 5, max = 30, initial = 10 }: { rowHeight: number; chrome?: number; min?: number; max?: number; initial?: number },
): number {
  const [rows, setRows] = useState(initial);

  useEffect(() => {
    const measure = () => {
      const el = ref.current;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const head = el.querySelector("thead")?.getBoundingClientRect().height ?? 0;
      const row = el.querySelector("tbody tr")?.getBoundingClientRect().height || rowHeight;
      // Everything after the table inside the same parent: the pagination row, with its margin.
      let after = 0;
      for (let n = el.nextElementSibling; n; n = n.nextElementSibling) {
        const r = n.getBoundingClientRect();
        after += r.height + parseFloat(getComputedStyle(n).marginTop || "0");
      }
      const frame = el.offsetHeight - el.clientHeight; // borders
      const fit = Math.floor((window.innerHeight - top - head - after - frame - BOTTOM_GAP) / row);
      setRows(Math.min(max, Math.max(min, fit)));
    };
    const ro = new ResizeObserver(measure);
    ro.observe(document.documentElement);
    window.addEventListener("resize", measure);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
    };
  }, [ref, rowHeight, min, max]);

  return rows;
}
