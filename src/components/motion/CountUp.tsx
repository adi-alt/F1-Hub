"use client";

import { useEffect, useRef, useState } from "react";

/** A number that counts up from zero the first time it scrolls into view. Shows the real value for screen
 * readers, without JS and under reduced motion. `format` renders each frame (e.g. a fixed decimal). */
export function CountUp({ value, durationMs = 900, format = (n) => String(Math.round(n)) }: { value: number; durationMs?: number; format?: (n: number) => string }) {
  const ref = useRef<HTMLSpanElement>(null);
  const [current, setCurrent] = useState<number | null>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    let raf = 0;
    const io = new IntersectionObserver(([entry]) => {
      if (!entry.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / durationMs);
        setCurrent(value * (1 - Math.pow(1 - p, 3)));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    io.observe(el);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [value, durationMs]);

  return (
    <span ref={ref} className="tabular">
      <span className="sr-only">{format(value)}</span>
      <span aria-hidden>{format(current ?? value)}</span>
    </span>
  );
}
