"use client";

import { TrackMap } from "@/components/ui/TrackMap";
import type { CircuitDrawing } from "@/lib/circuitLayout";
import type { CircuitTrackMap } from "@/lib/supabase/archive";

/**
 * A circuit's picture wherever one is shown small or as decoration (archive cards, the home's next race, a race's
 * sidebar): the site's own line drawing from the track library, in the circuits pages' style, so every circuit on the
 * site looks the same. It always fits the box it's given (the whole layout, centred, never cropped), unlike the
 * animated CircuitCanvas, which sizes itself to its width. Turn numbers only on request (`turns`), for the larger
 * placements. A circuit the library has no layout for falls back to its Wikipedia map; with neither, nothing.
 */
export function CircuitThumb({
  drawing,
  map,
  name,
  className = "",
  compact = false,
  turns = false,
}: {
  drawing: CircuitDrawing | null | undefined;
  map?: CircuitTrackMap | null;
  name: string;
  className?: string;
  compact?: boolean;
  turns?: boolean;
}) {
  if (!drawing) return map ? <TrackMap map={map} name={name} compact={compact} className={className || undefined} /> : null;
  const [x, y, w, h] = drawing.viewBox.split(/\s+/).map(Number);
  // Room round the outside for the glow and the turn numbers, in the drawing's own units.
  const pad = Math.max(w, h) * (turns ? 0.06 : 0.03);
  const cx = x + w / 2;
  const cy = y + h / 2;
  const font = Math.max(w, h) / 40;
  return (
    <svg
      viewBox={`${x - pad} ${y - pad} ${w + pad * 2} ${h + pad * 2}`}
      preserveAspectRatio="xMidYMid meet"
      role="img"
      aria-label={`${name} circuit layout`}
      className={`block ${className}`}
    >
      <path d={drawing.path} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth={12} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <path ref={fitToPath(turns ? 0.06 : 0.03)} d={drawing.path} fill="none" stroke="rgb(255 255 255 / 0.6)" strokeWidth={1.75} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      {turns &&
        drawing.turns.map((t) => {
          const dx = t.x - cx;
          const dy = t.y - cy;
          const d = Math.hypot(dx, dy) || 1;
          return (
            <text key={t.label} x={t.x + (dx / d) * font * 1.6} y={t.y + (dy / d) * font * 1.6} fontSize={font} fill="rgb(255 255 255 / 0.45)" textAnchor="middle" dominantBaseline="middle" aria-hidden>
              {t.label}
            </text>
          );
        })}
    </svg>
  );
}

/**
 * Fits the drawing's view to where its line actually is, once it's in the page: some layouts in the library carry a
 * viewBox that doesn't contain their path (Ain Diab's path sits at x 1,200 inside a 0-500 box, so it drew off-canvas
 * and the card looked empty). The path's own bounding box is the truth; the stored viewBox is only the first guess.
 * Set on the element directly, so there is no re-render.
 */
function fitToPath(padRatio: number) {
  return (path: SVGPathElement | null) => {
    if (!path?.ownerSVGElement) return;
    try {
      const box = path.getBBox();
      if (!box.width || !box.height) return;
      const pad = Math.max(box.width, box.height) * padRatio;
      path.ownerSVGElement.setAttribute("viewBox", `${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`);
    } catch {
      // getBBox throws for an element that isn't rendered (display: none); the stored viewBox stands.
    }
  };
}
