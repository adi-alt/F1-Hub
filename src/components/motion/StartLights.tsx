"use client";

import { useEffect, useRef } from "react";

const PODS = 5;
const STEP_MS = 420; // one light every 0.42s, as in a real start
const HOLD_MS = 900; // all five lit, then out
const REST_MS = 2600; // dark before the next start

/**
 * F1 start lights: five red lights come on one by one, hold, then all go out together, and the cycle repeats. It
 * runs only while the lights are on screen and the tab is visible, never under reduced motion, and is decorative
 * (aria-hidden).
 *
 * Drives the pods' data-on attributes directly rather than through state: it is pure decoration, so there is
 * nothing for React to reconcile, and it can't be held up by whatever is re-rendering around it.
 */
export function StartLights({ className }: { className?: string }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const root = ref.current;
    if (!root || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    const pods = Array.from(root.children);
    const set = (lit: number) => pods.forEach((p, i) => p.setAttribute("data-on", String(i < lit)));
    let timers: number[] = [];
    let running = false;
    let onScreen = true;

    const stop = () => {
      timers.forEach(clearTimeout);
      timers = [];
      running = false;
      set(0);
    };
    const cycle = () => {
      if (!onScreen || document.hidden) return stop();
      running = true;
      for (let i = 1; i <= PODS; i++) timers.push(window.setTimeout(() => set(i), i * STEP_MS));
      timers.push(window.setTimeout(() => set(0), PODS * STEP_MS + HOLD_MS));
      timers.push(window.setTimeout(cycle, PODS * STEP_MS + HOLD_MS + REST_MS));
    };
    const resume = () => {
      if (!running && onScreen && !document.hidden) {
        timers.push(window.setTimeout(cycle, 400));
        running = true;
      }
    };

    const io = new IntersectionObserver(([entry]) => {
      onScreen = entry.isIntersecting;
      if (onScreen) resume();
      else stop();
    });
    io.observe(root);
    const onVisibility = () => (document.hidden ? stop() : resume());
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
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
