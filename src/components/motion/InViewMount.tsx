"use client";

import { useRef, type ReactNode } from "react";
import { useInView } from "framer-motion";

/**
 * Mounts its children the first time they scroll into view, so a chart's entrance animation (bars growing,
 * rows sliding in) plays where the reader can see it rather than off-screen on page load. Reserves
 * `minHeight` until then so the page doesn't jump.
 */
export function InViewMount({ children, minHeight = 200 }: { children: ReactNode; minHeight?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, margin: "0px 0px -10% 0px" });
  return (
    <div ref={ref} style={inView ? undefined : { minHeight }}>
      {inView && children}
    </div>
  );
}
