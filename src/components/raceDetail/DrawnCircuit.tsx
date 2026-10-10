"use client";

import { motion, useReducedMotion } from "framer-motion";
import type { DrawnLayout } from "@/lib/circuitLayout";

/**
 * A circuit from the track library's drawings (f1-circuits-svg): the layout as it was raced in this season, drawn
 * in on first view the way the traced circuits are. A drawing, in no real coordinate frame - so nothing is
 * located on it, and the credit sits under it.
 */
export function DrawnCircuit({ layout }: { layout: DrawnLayout }) {
  const reduceMotion = useReducedMotion();
  return (
    <figure className="m-0">
      <svg viewBox={layout.viewBox} className="mx-auto block h-auto max-h-[22rem] w-full" role="img" aria-label="Circuit layout as raced this season (a drawing)">
        <path d={layout.path} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth={14} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <motion.path
          d={layout.path}
          fill="none"
          stroke="rgb(255 255 255 / 0.55)"
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={reduceMotion ? false : { pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: reduceMotion ? 0 : 1.6, ease: [0.4, 0, 0.2, 1] }}
        />
      </svg>
      {layout.attribution && <figcaption className="mt-1 text-center text-caption text-tertiary">Drawing: {layout.attribution}</figcaption>}
    </figure>
  );
}
