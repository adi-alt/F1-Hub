import { useLayoutEffect, useRef, useState } from "react";

/** Measures a content node's real height and keeps it in state, live, via ResizeObserver - the
 * container that renders it can then animate `height` to real pixel values on every change
 * instead of snapping, and (because it's a real height, not a transform) content that follows on
 * the page reflows in step with the animation rather than jumping once it ends. Extracted from
 * AnalysisWorkspace.tsx (Season's own tab-crossfade container) so RaceTabShell - the race page's
 * equivalent - shares the exact same mechanism instead of a second copy of it. */
export function useMeasuredHeight<T extends HTMLElement>(dep: unknown) {
  const ref = useRef<T>(null);
  const [height, setHeight] = useState<number | undefined>(undefined);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = () => setHeight(el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [dep]);
  return { ref, height };
}
