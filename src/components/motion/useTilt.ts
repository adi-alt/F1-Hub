"use client";

import type { CSSProperties, PointerEvent } from "react";

const MAX_DEG = 6;

/** Pointer handlers and a style that tilt an element toward the cursor (globals.css .tilt), with an optional
 * glow colour (a team's). Mouse and pen only: touch scrolls instead. */
export function tiltProps(glow?: string | null) {
  return {
    className: "tilt",
    style: (glow ? { "--glow": `${glow}66` } : {}) as CSSProperties,
    onPointerMove(e: PointerEvent<HTMLElement>) {
      if (e.pointerType === "touch") return;
      const r = e.currentTarget.getBoundingClientRect();
      const x = (e.clientX - r.left) / r.width - 0.5;
      const y = (e.clientY - r.top) / r.height - 0.5;
      e.currentTarget.style.setProperty("--tilt-x", `${(x * MAX_DEG * 2).toFixed(2)}deg`);
      e.currentTarget.style.setProperty("--tilt-y", `${(-y * MAX_DEG * 2).toFixed(2)}deg`);
    },
    onPointerLeave(e: PointerEvent<HTMLElement>) {
      e.currentTarget.style.setProperty("--tilt-x", "0deg");
      e.currentTarget.style.setProperty("--tilt-y", "0deg");
    },
  };
}
