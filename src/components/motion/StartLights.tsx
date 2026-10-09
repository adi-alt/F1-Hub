"use client";

import { useEffect, useRef } from "react";

const PODS = 5;
const STEP_MS = 420;
const HOLD_MS = 700;
const SEEN_KEY = "apex:start-lights";

/**
 * The F1 start: five red lights come on one by one, hold, then all go out together. Plays once per visit (a
 * second run on every navigation would wear thin), never under reduced motion, and is decorative only.
 *
 * Drives the pods' data-on attributes directly rather than through state: it is pure decoration, so there is
 * nothing for React to reconcile, and it can't be held up by whatever is re-rendering around the hero.
 */
export function StartLights({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const pods = ref.current ? Array.from(ref.current.children) : [];
    let seen = false;
    try {
      seen = sessionStorage.getItem(SEEN_KEY) === "1";
    } catch {
      /* storage blocked: just play it */
    }
    if (pods.length === 0 || seen || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const set = (lit: number) => pods.forEach((p, i) => p.setAttribute("data-on", String(i < lit)));
    const timers: number[] = [];
    for (let i = 1; i <= PODS; i++) timers.push(window.setTimeout(() => set(i), 300 + i * STEP_MS));
    timers.push(
      window.setTimeout(() => {
        set(0);
        // Marked seen only once it has played (an effect that is set up twice must not skip it).
        try {
          sessionStorage.setItem(SEEN_KEY, "1");
        } catch {
          /* ignore */
        }
      }, 300 + PODS * STEP_MS + HOLD_MS),
    );
    return () => {
      timers.forEach(clearTimeout);
      set(0);
    };
  }, []);

  return (
    <div ref={ref} aria-hidden className={["flex items-center gap-2", className].filter(Boolean).join(" ")}>
      {Array.from({ length: PODS }, (_, i) => (
        <span key={i} className="start-light" data-on="false" />
      ))}
    </div>
  );
}
