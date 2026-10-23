"use client";

// Adapted from Bklit UI (MIT, see LICENSE.md): a ring chart, Apple-activity style. Each item is a concentric ring
// filled to value / maxValue; hovering one names it in the centre. Fixed size only. The SVG rings and the HTML
// centre are stacked with CSS grid rather than a foreignObject (Safari mispositions HTML inside foreignObject).

import NumberFlow from "@number-flow/react";
import type { Transition } from "motion/react";
import { Children, isValidElement, type ReactNode, useCallback, useMemo, useState } from "react";
import { DEFAULT_RING_COLORS, type RingData, RingProvider, useRingHover, useRingStable } from "./ring-context";

export type { RingData } from "./ring-context";
export { Ring } from "./ring";

export interface RingChartProps {
  data: RingData[];
  /** Width and height in px. */
  size: number;
  /** Thickness of each ring. */
  strokeWidth?: number;
  ringGap?: number;
  /** Inner radius of the innermost ring (before scaling to fit). */
  baseInnerRadius?: number;
  /** Start and end angles in radians; the default is a full circle from the top. */
  startAngle?: number;
  endAngle?: number;
  enterTransition?: Transition;
  enterStaggerScale?: number;
  /** Accessible summary of what the rings show; the drawing itself is hidden from assistive tech. */
  ariaLabel: string;
  className?: string;
  /** <Ring /> elements, and optionally one <RingCenter />. */
  children: ReactNode;
}

function isRingCenter(child: ReactNode): boolean {
  return isValidElement(child) && typeof child.type === "function" && (child.type as { displayName?: string }).displayName === "RingCenter";
}

export function RingChart({
  data,
  size,
  strokeWidth: strokeWidthProp = 12,
  ringGap: ringGapProp = 6,
  baseInnerRadius: baseInnerRadiusProp = 60,
  startAngle = -Math.PI / 2,
  endAngle = (3 * Math.PI) / 2,
  enterTransition,
  enterStaggerScale = 1,
  ariaLabel,
  className = "",
  children,
}: RingChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const center = size / 2;
  // Scale the design radii down so the outermost ring fits with a little padding.
  const designOuter = baseInnerRadiusProp + (data.length - 1) * (strokeWidthProp + ringGapProp) + strokeWidthProp;
  const scale = Math.min(1, (center - 4) / designOuter);
  const strokeWidth = strokeWidthProp * scale;
  const ringGap = ringGapProp * scale;
  const baseInnerRadius = baseInnerRadiusProp * scale;

  const getColor = useCallback((index: number) => data[index]?.color ?? DEFAULT_RING_COLORS[index % DEFAULT_RING_COLORS.length], [data]);
  const getRingRadii = useCallback(
    (index: number) => {
      const innerRadius = baseInnerRadius + index * (strokeWidth + ringGap);
      return { innerRadius, outerRadius: innerRadius + strokeWidth };
    },
    [baseInnerRadius, strokeWidth, ringGap],
  );
  const totalValue = useMemo(() => data.reduce((sum, d) => sum + d.value, 0), [data]);

  const stable = useMemo(
    () => ({ data, size, center, strokeWidth, ringGap, baseInnerRadius, animationKey: 0, enterTransition, enterStaggerScale, totalValue, getColor, getRingRadii, startAngle, endAngle }),
    [data, size, center, strokeWidth, ringGap, baseInnerRadius, enterTransition, enterStaggerScale, totalValue, getColor, getRingRadii, startAngle, endAngle],
  );
  const hover = useMemo(() => ({ hoveredIndex, setHoveredIndex }), [hoveredIndex]);

  const svgChildren: ReactNode[] = [];
  const centerChildren: ReactNode[] = [];
  Children.forEach(children, (child) => (isRingCenter(child) ? centerChildren : svgChildren).push(child));

  return (
    <RingProvider stable={stable} hover={hover}>
      <div role="img" aria-label={ariaLabel} className={`relative grid shrink-0 ${className}`} style={{ width: size, height: size, gridTemplate: "1fr / 1fr" }}>
        <svg aria-hidden width={size} height={size} style={{ gridArea: "1 / 1", overflow: "visible" }}>
          <g transform={`translate(${center}, ${center})`}>
            {svgChildren}
          </g>
        </svg>
        {centerChildren.length > 0 && (
          <div aria-hidden className="pointer-events-none flex items-center justify-center" style={{ gridArea: "1 / 1" }}>
            {centerChildren}
          </div>
        )}
      </div>
    </RingProvider>
  );
}

/** The centre of a ring chart: `children` by default (e.g. "1/3"), or the hovered ring's own value and label. Numbers
 * roll with NumberFlow when they change. */
export function RingCenter({ children, valueClassName = "text-body-sm font-semibold text-primary", labelClassName = "text-caption text-secondary" }: { children?: ReactNode; valueClassName?: string; labelClassName?: string }) {
  const { data } = useRingStable();
  const { hoveredIndex } = useRingHover();
  const hovered = hoveredIndex === null ? null : data[hoveredIndex];
  if (!hovered) return <div className="flex flex-col items-center text-center">{children}</div>;
  return (
    <div className="flex max-w-full flex-col items-center px-1 text-center">
      <span className={`tabular ${valueClassName}`}>
        <NumberFlow value={hovered.value} />
        <span className="text-secondary">/{hovered.maxValue}</span>
      </span>
      <span className={`max-w-full truncate ${labelClassName}`}>{hovered.label}</span>
    </div>
  );
}
RingCenter.displayName = "RingCenter";
