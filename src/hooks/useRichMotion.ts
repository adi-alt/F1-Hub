"use client";

import { useSyncExternalStore } from "react";

/** Desktop with a mouse, and no "reduce motion" set in the operating system: the full, continuous motion (floating
 * windows, looping miniatures, cars lapping, pointer parallax). Phones and tablets get a calm version - the finished
 * frame, light fades only - and so does anyone who asked their system to reduce motion (an accessibility setting,
 * off by default, respected on every device). Same query as globals.css's `rich-motion` styles. */
export const RICH_MOTION_QUERY = "(min-width: 1024px) and (hover: hover) and (pointer: fine) and (prefers-reduced-motion: no-preference)";

function subscribe(onChange: () => void) {
  const mq = window.matchMedia(RICH_MOTION_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}

export function useRichMotion(): boolean {
  return useSyncExternalStore(
    subscribe,
    () => window.matchMedia(RICH_MOTION_QUERY).matches,
    () => false, // server render: the calm version, enhanced after hydration on desktop
  );
}
