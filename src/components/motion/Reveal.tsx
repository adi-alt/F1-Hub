"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * Rises into view the first time it scrolls into the viewport (globals.css [data-reveal]). Only content that is
 * below the fold when the page loads is hidden first, so nothing the reader can already see ever blinks out, and
 * without JavaScript, or with reduced motion, everything is simply shown.
 */
export function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"idle" | "pending" | "in">("idle");

  useEffect(() => {
    const el = ref.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    if (el.getBoundingClientRect().top < window.innerHeight * 0.92) return; // already visible: leave it alone
    setState("pending");
    const io = new IntersectionObserver(
      ([entry]) => {
        if (!entry.isIntersecting) return;
        io.disconnect();
        window.setTimeout(() => setState("in"), delay);
      },
      { rootMargin: "0px 0px -10% 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [delay]);

  return (
    <div ref={ref} className={className} data-reveal={state === "idle" ? undefined : state}>
      {children}
    </div>
  );
}
