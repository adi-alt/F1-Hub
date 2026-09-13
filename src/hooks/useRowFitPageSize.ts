"use client";

import { useLayoutEffect, useState, type RefObject } from "react";

const SAFETY_MARGIN_PX = 8;

/** However many whole table rows actually fit the available height, measured from real rendered
 * thead/row/footer heights via ResizeObserver — not a fixed page size. `rootRef` is the element
 * stretched to fill the available space (its clientHeight is what "available" is measured
 * against); `footerRef` is optional since not every paginated table has its own footer row to
 * leave room for. Recomputes on resize, so the page size stays responsive to viewport/window
 * height changes, and `useLayoutEffect` (not `useEffect`) corrects the initial guess before the
 * browser paints, avoiding a visible flicker. */
export function useRowFitPageSize(
  rootRef: RefObject<HTMLElement | null>,
  theadRef: RefObject<HTMLElement | null>,
  firstRowRef: RefObject<HTMLElement | null>,
  footerRef?: RefObject<HTMLElement | null>,
  initialGuess = 14,
): number {
  const [pageSize, setPageSize] = useState(initialGuess);

  useLayoutEffect(() => {
    function recompute() {
      const root = rootRef.current;
      const thead = theadRef.current;
      const row = firstRowRef.current;
      const footer = footerRef?.current;
      if (!root || !thead || !row || row.clientHeight === 0) return;
      const footerSpace = footer ? footer.offsetHeight + 12 : 0; // 12px = the footer's own mt-3
      const available = root.clientHeight - thead.clientHeight - footerSpace - SAFETY_MARGIN_PX;
      const fit = Math.max(1, Math.floor(available / row.clientHeight));
      setPageSize((prev) => (prev === fit ? prev : fit));
    }
    recompute();
    if (!rootRef.current) return;
    const observer = new ResizeObserver(recompute);
    observer.observe(rootRef.current);
    return () => observer.disconnect();
    // Refs are stable across renders — nothing else this effect reads ever changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return pageSize;
}
