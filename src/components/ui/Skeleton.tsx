import type { ReactNode } from "react";

export type SkeletonShape = "text" | "block" | "circle" | "row";

const SHAPES: Record<SkeletonShape, string> = {
  // One body-sm line: the full 20px line box, drawn 12px tall, so a stack of them is exactly as
  // tall as the lines of text it stands in for and still reads as separate lines.
  text: "h-5 scale-y-60 rounded-control",
  block: "rounded-card",
  circle: "rounded-full",
  // One table row.
  row: "h-11 rounded-control",
};

/**
 * A loading placeholder that occupies the box its content will, so nothing moves when it arrives.
 * text is one body-sm line and row one table row (44px), both full width unless told otherwise;
 * block and circle take their size from `className`. One animation: a 1.6s opacity pulse, static
 * under reduced motion. Hidden from assistive tech: wrap skeletons in SkeletonGroup, which
 * announces loading once.
 *
 * `className` is for layout only (size, margins, placement), never colour or shape.
 */
export function Skeleton({ shape = "text", className }: { shape?: SkeletonShape; className?: string }) {
  return (
    <span
      aria-hidden="true"
      className={["block animate-[pulse_1.6s_ease-in-out_infinite] bg-primary/10 motion-reduce:animate-none", SHAPES[shape], className].filter(Boolean).join(" ")}
    />
  );
}

/**
 * Wraps a set of skeletons in one role="status" region that says "Loading…" (or `label`) to
 * screen readers once, rather than once per placeholder. It stays invisible for its first 300ms
 * (`delay`, spec §9.1), so a fast load never flashes a skeleton. `className` is for layout only.
 */
export function SkeletonGroup({ label = "Loading…", delay = true, className, children }: { label?: string; delay?: boolean; className?: string; children?: ReactNode }) {
  return (
    <div role="status" className={[delay && "skeleton-delay", className].filter(Boolean).join(" ") || undefined}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
