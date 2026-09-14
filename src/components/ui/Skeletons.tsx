// One skeleton system for the Season page and the race window.
//
// The rule these all follow: a skeleton must occupy the SAME box its real content will, so
// nothing moves when the content arrives. That matters most for media - an image with no reserved
// box collapses to zero height and then shoves the whole page down when it loads.
//
// All of them share the `.skeleton-shimmer` class, which already degrades to a static fill under
// prefers-reduced-motion (see globals.css) - so reduced-motion support lives in exactly one place
// rather than being re-decided per component.

import type { CSSProperties, ReactNode } from "react";

const BASE = "skeleton-shimmer rounded-[3px] bg-white/[0.04]";

/** One line of text. `width` is a percentage so a paragraph of these reads as ragged prose rather
 * than a stack of identical bars. */
export function TextSkeleton({ width = "100%", height = 12, className = "" }: { width?: string | number; height?: number; className?: string }) {
  return <div className={`${BASE} ${className}`} style={{ width, height }} />;
}

/** A paragraph. Widths taper the way a real last line does. */
export function ParagraphSkeleton({ lines = 3, className = "" }: { lines?: number; className?: string }) {
  const widths = ["100%", "96%", "88%", "92%", "70%"];
  return (
    <div className={`flex flex-col gap-2 ${className}`}>
      {Array.from({ length: lines }, (_, i) => (
        <TextSkeleton key={i} width={i === lines - 1 ? "62%" : widths[i % widths.length]} height={11} />
      ))}
    </div>
  );
}

/** Reserves an image's box so the layout is the right shape before the bytes arrive and the
 * crossfade has nothing to push around.
 *
 * Two modes, because both are real: by default it sizes itself from an aspect ratio, and with
 * `fill` it stretches inside a parent that is already sized (the race window's hero and its
 * thumbnails, which set their own dimensions and just need something shimmering behind the image
 * until it decodes). */
export function MediaSkeleton({
  ratio = "16 / 9",
  className = "",
  rounded = "rounded-lg",
  fill = false,
}: {
  ratio?: string;
  className?: string;
  rounded?: string;
  fill?: boolean;
}) {
  if (fill) return <span aria-hidden className={`${BASE} ${rounded} absolute inset-0 ${className}`} />;
  return <div className={`${BASE} ${rounded} w-full ${className}`} style={{ aspectRatio: ratio, height: "auto" }} />;
}

/** A label-over-value pair, the shape used by every stat in the snapshot and the race window. */
export function MetricSkeleton({ className = "" }: { className?: string }) {
  return (
    <div className={`flex flex-col gap-1.5 ${className}`}>
      <TextSkeleton width="52%" height={8} />
      <TextSkeleton width="78%" height={14} />
    </div>
  );
}

/** An Apex block: eyebrow, headline, then narrative. Used anywhere intelligence is pending, so
 * every AI surface on the page waits in the same visual language. */
export function InsightSkeleton({ lines = 2, eyebrow = true, className = "" }: { lines?: number; eyebrow?: boolean; className?: string }) {
  return (
    <div className={className} aria-hidden>
      {eyebrow && <TextSkeleton width={104} height={8} />}
      <TextSkeleton className={eyebrow ? "mt-3" : ""} width="58%" height={15} />
      <ParagraphSkeleton className="mt-2.5" lines={lines} />
    </div>
  );
}

/** Wraps a loading region with the right live-region semantics once, instead of every caller
 * remembering to. Screen readers get "loading", sighted users get the shimmer. */
export function LoadingRegion({ label, children, style }: { label: string; children: ReactNode; style?: CSSProperties }) {
  return (
    <div role="status" aria-live="polite" aria-busy="true" style={style}>
      <span className="sr-only">{label}</span>
      {children}
    </div>
  );
}
