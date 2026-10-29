"use client";

import { useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from "react";

/** Measures `root` and reports how many leading children fit inside its height, `gap` px apart. Children past
 * that point must stay measurable (rendered `invisible`, not removed) so the count can grow back on resize. */
export function useFitCount(root: RefObject<HTMLElement | null>, gap: number, deps: unknown[], when?: string): number {
  const [fit, setFit] = useState(Number.POSITIVE_INFINITY);
  useLayoutEffect(() => {
    const el = root.current;
    if (!el) return;
    const measure = () => {
      // Outside `when` the column is in normal flow with no height of its own, so everything shows.
      if (when && !window.matchMedia(when).matches) {
        setFit(Number.POSITIVE_INFINITY);
        return;
      }
      let used = 0;
      let n = 0;
      for (const child of Array.from(el.children) as HTMLElement[]) {
        if (child.offsetHeight === 0) {
          n++;
          continue;
        }
        const next = used + (used > 0 ? gap : 0) + child.offsetHeight;
        if (next > el.clientHeight + 0.5) break;
        used = next;
        n++;
      }
      setFit(n);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);
    return () => ro.disconnect();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [root, gap, when, ...deps]);
  return fit;
}

/**
 * A rail column that never scrolls and never cuts a block in half: blocks are given in priority order and only
 * the leading ones that fit the column's height are shown. A shorter window drops the least important block
 * whole instead of clipping it (scroll-views.md: no nested scroll views in the same orientation; the feed beside
 * it is the one that scrolls).
 */
export function FitStack({ children, gap = 12, when, className = "" }: { children: ReactNode[]; gap?: number; /** Media query where the column has a fixed height; elsewhere it is a plain stack. */ when?: string; className?: string }) {
  const blocks = children.filter(Boolean);
  const rootRef = useRef<HTMLDivElement>(null);
  const fit = useFitCount(rootRef, gap, [blocks.length], when);
  return (
    <div ref={rootRef} className={`relative min-h-0 ${className}`}>
      {blocks.map((block, i) =>
        i < fit ? (
          <div key={i} style={i ? { marginTop: gap } : undefined}>
            {block}
          </div>
        ) : (
          // Kept in the tree, invisible, so it can be measured and come back when the window grows.
          <div key={i} aria-hidden inert className="invisible absolute inset-x-0 top-0">
            {block}
          </div>
        ),
      )}
    </div>
  );
}
