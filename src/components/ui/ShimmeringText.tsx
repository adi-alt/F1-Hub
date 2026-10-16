"use client";

// Adapted from Bklit UI's shimmering-text (MIT, see components/charts/ring/LICENSE.md): a light that runs along a
// label, for something that is working (Apex reading, a send in flight). Static under reduced motion.

import { motion, useReducedMotion, type Variants } from "motion/react";
import { useCallback, type CSSProperties } from "react";

export function ShimmeringText({ text, duration = 1.2, paused = false, className = "" }: { text: string; duration?: number; paused?: boolean; className?: string }) {
  const reducedMotion = useReducedMotion();
  const stopped = paused || reducedMotion === true;

  const variants = useCallback(
    (i: number): Variants => ({
      running: {
        color: ["var(--shimmer-base)", "var(--shimmer-light)", "var(--shimmer-base)"],
        transition: { duration, repeat: Number.POSITIVE_INFINITY, repeatType: "loop", repeatDelay: text.length * 0.04, delay: (i * duration) / text.length, ease: "easeInOut" },
      },
      stopped: { color: "var(--shimmer-base)", transition: { duration: duration * 0.5, ease: "easeOut" } },
    }),
    [duration, text.length],
  );

  // The two shimmer colours as custom properties, set inline (the base is the tertiary text tone, the light is primary).
  const style = { "--shimmer-base": "var(--text-tertiary)", "--shimmer-light": "var(--text-primary)" } as CSSProperties;

  return (
    <span className={`inline-flex select-none items-center ${className}`} style={style}>
      {text.split("").map((char, i) => (
        <motion.span key={i} aria-hidden className="inline-block whitespace-pre" initial="stopped" animate={stopped ? "stopped" : "running"} variants={variants(i)}>
          {char}
        </motion.span>
      ))}
      <span className="sr-only">{text}</span>
    </span>
  );
}
