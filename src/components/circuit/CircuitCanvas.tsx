"use client";

import { useEffect, useId, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { CircuitDrawing } from "@/lib/circuitLayout";

/**
 * A circuit from the track library, drawn in: a soft band under a crisp line that traces itself when the drawing
 * changes (a new round, a new era). A measured layout carries its verified turn numbers; a drawn layout is a
 * drawing and says so in its credit. Renders nothing without a drawing - there is no stand-in shape.
 *
 * `lapColor` sends a car round it: a glowing head with a fading trail, lapping in `lapSeconds`, in a colour that
 * means something where it's used (the winner's team, or the brand red for the next race). It's pure SVG animation,
 * so it costs no JavaScript per frame, and it's left out entirely under reduced motion.
 */
export function CircuitCanvas({
  drawing,
  className = "max-h-[22rem]",
  caption = true,
  lapColor = null,
  lapSeconds = 7,
  lapDelay = 0,
}: {
  drawing: CircuitDrawing | null;
  className?: string;
  caption?: boolean;
  lapColor?: string | null;
  lapSeconds?: number;
  /** Seconds into the lap to start at, so cars on a page of drawings don't all move in step. */
  lapDelay?: number;
}) {
  const reduceMotion = useReducedMotion();
  const pathId = `track-${useId().replace(/:/g, "")}`;
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null);
  const vbW = drawing ? Number(drawing.viewBox.split(/\s+/)[2]) : 1;
  const vbH = drawing ? Number(drawing.viewBox.split(/\s+/)[3]) : 1;
  const [unit, setUnit] = useState(vbW / 640);
  useEffect(() => {
    if (!svgEl) return;
    const ro = new ResizeObserver(([e]) => {
      const { width, height } = e.contentRect;
      if (width > 0 && height > 0) setUnit(Math.max(vbW / width, vbH / height));
    });
    ro.observe(svgEl);
    return () => ro.disconnect();
  }, [svgEl, vbW, vbH]);

  if (!drawing) return null;
  // Turn numbers sit beside the track, pushed outward from the circuit's centre.
  const centre = drawing.turns.length ? [drawing.turns.reduce((n, t) => n + t.x, 0) / drawing.turns.length, drawing.turns.reduce((n, t) => n + t.y, 0) / drawing.turns.length] : [0, 0];
  return (
    <figure className="m-0 min-w-0">
      <svg
        ref={setSvgEl}
        key={drawing.layoutId}
        viewBox={drawing.viewBox}
        className={`mx-auto block h-auto w-full ${className}`}
        role="img"
        aria-label={`Circuit layout, ${drawing.source === "measured" ? "traced from F1 timing data" : "a drawing"}, raced ${drawing.seasons[0]}${drawing.seasons.length > 1 ? ` to ${drawing.seasons[drawing.seasons.length - 1]}` : ""}`}
      >
        <path d={drawing.path} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth={14} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
        <motion.path
          d={drawing.path}
          fill="none"
          stroke="rgb(255 255 255 / 0.55)"
          strokeWidth={2}
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={reduceMotion ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: reduceMotion ? 0 : 1.2, ease: [0.4, 0, 0.2, 1] }}
        />
        {lapColor && !reduceMotion && (
          <g aria-hidden>
            {/* Invisible copy of the line, normalised to length 100, for the trail's dashes and the head's motion. */}
            <path id={pathId} d={drawing.path} pathLength={100} fill="none" stroke="none" />
            {[
              { len: 22, width: 5, opacity: 0.18 },
              { len: 12, width: 3.5, opacity: 0.45 },
              { len: 5, width: 2.5, opacity: 0.95 },
            ].map((t) => (
              // Each dash ends at the same point - the car - and trails back `len` along the track. (No non-scaling
              // stroke here: it would measure the dashes in screen pixels and ignore pathLength.)
              <path key={t.len} d={drawing.path} pathLength={100} fill="none" stroke={lapColor} strokeOpacity={t.opacity} strokeWidth={t.width * unit} strokeLinecap="round" strokeDasharray={`${t.len} ${100 - t.len}`}>
                <animate attributeName="stroke-dashoffset" from={t.len} to={t.len - 100} dur={`${lapSeconds}s`} begin={`-${lapDelay}s`} repeatCount="indefinite" />
              </path>
            ))}
            <circle r={5 * unit} fill={lapColor} style={{ filter: `drop-shadow(0 0 ${4 * unit}px ${lapColor})` }}>
              <animateMotion dur={`${lapSeconds}s`} begin={`-${lapDelay}s`} repeatCount="indefinite" rotate="auto">
                <mpath href={`#${pathId}`} />
              </animateMotion>
            </circle>
          </g>
        )}
        {drawing.turns.map((t) => {
          const dx = t.x - centre[0];
          const dy = t.y - centre[1];
          const d = Math.hypot(dx, dy) || 1;
          return (
          <text key={t.label} x={t.x + (dx / d) * 16 * unit} y={t.y + (dy / d) * 16 * unit} fontSize={10 * unit} fill="rgb(255 255 255 / 0.45)" textAnchor="middle" dominantBaseline="middle" className="tabular" aria-hidden>
            {t.label}
          </text>
          );
        })}
      </svg>
      {caption && drawing.source === "drawn" && drawing.attribution && <figcaption className="mt-1 text-center text-caption text-tertiary">Drawing: {drawing.attribution}</figcaption>}
    </figure>
  );
}
