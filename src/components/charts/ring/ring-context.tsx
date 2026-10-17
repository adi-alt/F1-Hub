"use client";

// Adapted from Bklit UI (MIT, see LICENSE.md): the ring chart's shared state, split into a stable part and a hover
// part so hovering one ring doesn't re-render the geometry of every other.

import type { Transition } from "motion/react";
import { createContext, type ReactNode, useContext, useMemo } from "react";

/** The track behind each ring: a faint white, which reads on the frosted widgets and on the page alike. */
export const RING_TRACK = "rgb(255 255 255 / 0.08)";

/** Fallback ring colours when an item names none: this app's own semantic tokens. */
export const DEFAULT_RING_COLORS = ["var(--brand)", "var(--success)", "var(--info)", "var(--warning)", "var(--text-secondary)"];

export interface RingData {
  /** What the ring measures; shown in the centre while it's hovered. */
  label: string;
  value: number;
  /** The value that fills the ring. */
  maxValue: number;
  color?: string;
}

/** A stable pointer band for ring `index`: it doesn't grow with the hover scale, so the pointer can't fall off a
 * growing ring and flicker. Neighbouring bands share an edge (half the gap each side). */
export function getRingHitRadii(index: number, baseInnerRadius: number, strokeWidth: number, ringGap: number) {
  const halfGap = Math.max(0, ringGap) / 2;
  const bandInner = baseInnerRadius + index * (strokeWidth + ringGap);
  return { innerRadius: Math.max(0, bandInner - halfGap), outerRadius: bandInner + strokeWidth + halfGap };
}

export interface RingStableContextValue {
  data: RingData[];
  size: number;
  center: number;
  strokeWidth: number;
  ringGap: number;
  baseInnerRadius: number;
  animationKey: number;
  enterTransition?: Transition;
  enterStaggerScale: number;
  totalValue: number;
  getColor: (index: number) => string;
  getRingRadii: (index: number) => { innerRadius: number; outerRadius: number };
  startAngle: number;
  endAngle: number;
}

export interface RingHoverContextValue {
  hoveredIndex: number | null;
  setHoveredIndex: (index: number | null) => void;
}

const RingStableContext = createContext<RingStableContextValue | null>(null);
const RingHoverContext = createContext<RingHoverContextValue | null>(null);

export function RingProvider({ children, stable, hover }: { children: ReactNode; stable: RingStableContextValue; hover: RingHoverContextValue }) {
  const hoverValue = useMemo(() => hover, [hover]);
  return (
    <RingStableContext.Provider value={stable}>
      <RingHoverContext.Provider value={hoverValue}>{children}</RingHoverContext.Provider>
    </RingStableContext.Provider>
  );
}

export function useRingStable(): RingStableContextValue {
  const context = useContext(RingStableContext);
  if (!context) throw new Error("useRingStable must be used within <RingChart>.");
  return context;
}

export function useRingHover(): RingHoverContextValue {
  const context = useContext(RingHoverContext);
  if (!context) throw new Error("useRingHover must be used within <RingChart>.");
  return context;
}
