"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";

/**
 * The F1 Hub mark, "Apex": an A drawn in thick round strokes, its crossbar running out past the leg as a racing line
 * with the car (the one red element) at its end. On a desktop with motion, the car pulls back and launches along the
 * line when the mark is hovered and each time the page changes, a small sign that the site is moving with you
 * (globals.css: .apex-launch, only inside the rich-motion media query). The first render is the resting mark, the
 * same on the server and in the browser, so nothing moves or swaps as the page loads.
 */
export function ApexMark({ size = 24, className }: { size?: number; className?: string }) {
  const pathname = usePathname();
  // A new lap on each route change (not on the first render): React's "adjust state when a prop changes" pattern.
  const [seen, setSeen] = useState(pathname);
  const [lap, setLap] = useState(0);
  if (seen !== pathname) {
    setSeen(pathname);
    setLap(lap + 1);
  }

  return (
    <svg
      aria-hidden
      width={(size * 46) / 31}
      height={size}
      viewBox="0 0 46 31"
      fill="none"
      className={className}
    >
      <g stroke="currentColor" strokeWidth={3} strokeLinecap="round" strokeLinejoin="round">
        <path d="M6 26 L17 8 L28 26" />
        <g key={lap} className={lap ? "apex-launch" : undefined}>
          <path className="apex-bar" pathLength={1} d="M10.5 19 L40 19" />
          <circle className="apex-car" cx={41} cy={19} r={3.4} fill="var(--color-brand)" stroke="none" />
        </g>
      </g>
    </svg>
  );
}
