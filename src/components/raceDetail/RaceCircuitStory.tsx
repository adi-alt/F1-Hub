"use client";

import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "framer-motion";
import type { Chapter } from "@/lib/raceMoments";
import { projectTrack, smoothClosedPath, stretchAround, type RaceTrackStory, type TrackLeadChange } from "@/lib/raceTrackStory";

/** Metres of track either side of a chapter's location to highlight. */
const HIGHLIGHT_M = 180;

export type ChapterPlace = { change: TrackLeadChange | null; xy: [number, number] | null; alongM: number | null };

/** Where each chapter happened on the circuit, when the data says so: an on-track pass is a point; the start
 * chapter is the pass off the line when there was one; the flag is the timing line when it's verified. Pit
 * changes and the biggest one-lap move have no single spot, so no point. */
export function placeChapters(chapters: Chapter[], track: RaceTrackStory, match: (lap: number, driver: string) => TrackLeadChange | null): ChapterPlace[] {
  return chapters.map((c) => {
    if (c.kind === "finish") {
      return track.startFinish.verified ? { change: null, xy: [track.startFinish.x, track.startFinish.y], alongM: 0 } : { change: null, xy: null, alongM: null };
    }
    if (c.kind !== "lead" && c.kind !== "start") return { change: null, xy: null, alongM: null };
    const change = match(c.lap, c.driverId);
    if (change?.kind === "pass") return { change, xy: [change.x, change.y], alongM: change.alongM };
    return { change, xy: null, alongM: null };
  });
}

/**
 * The race on its real circuit: the outline traced from one clean lap of this race, the timing line and turn
 * numbers where they're verified, and a marker wherever a chapter actually happened. The selected chapter's
 * stretch of track lights up in its driver's colour. Drawing only - selection and the keyboard live in
 * RaceStoryline, which also lists every chapter, located or not.
 */
export function RaceCircuitStory({
  track,
  chapters,
  places,
  active,
  colorFor,
  onSelect,
}: {
  track: RaceTrackStory;
  chapters: Chapter[];
  places: ChapterPlace[];
  active: number;
  colorFor: (driverId: string) => string;
  onSelect: (index: number) => void;
}) {
  const reduceMotion = useReducedMotion();
  const proj = useMemo(() => projectTrack(track), [track]);
  const path = useMemo(() => smoothClosedPath(proj.points), [proj]);
  const [vbW, vbH] = proj.viewBox.split(" ").slice(2).map(Number);

  // SVG units per CSS pixel, so markers and labels keep a constant on-screen size whatever the circuit's scale.
  const [svgEl, setSvgEl] = useState<SVGSVGElement | null>(null);
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

  const centroid = useMemo(() => {
    const n = proj.points.length;
    return [proj.points.reduce((s, p) => s + p[0], 0) / n, proj.points.reduce((s, p) => s + p[1], 0) / n] as const;
  }, [proj]);

  const activePlace = places[active];
  const activeColor = colorFor(chapters[active]?.driverId ?? "");
  const approx = (p: ChapterPlace | undefined) => p?.change?.kind === "pass" && p.change.precision === "approximate";
  const activeApprox = approx(activePlace);
  const highlight = useMemo(() => {
    if (activePlace?.alongM == null) return null;
    // An approximate location lights up its whole uncertainty, not a confident ±180 m.
    const change = activePlace.change;
    const reach = change?.kind === "pass" ? Math.max(HIGHLIGHT_M, change.uncertaintyM) : HIGHLIGHT_M;
    const pts = stretchAround(proj.points, track.lapLengthM, activePlace.alongM, reach);
    return pts.length > 1 ? `M${pts.map(([x, y]) => `${x.toFixed(0)},${y.toFixed(0)}`).join("L")}` : null;
  }, [activePlace, proj, track.lapLengthM]);

  // A short tick across the track at the timing line, perpendicular to the direction of travel.
  const sfTick = useMemo(() => {
    if (!track.startFinish.verified) return null;
    const [a, b] = [proj.points[0], proj.points[1]];
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]) || 1;
    const [nx, ny] = [-(b[1] - a[1]) / len, (b[0] - a[0]) / len];
    return { a, nx, ny };
  }, [proj, track.startFinish.verified]);

  return (
    <svg
      ref={setSvgEl}
      viewBox={proj.viewBox}
      className="mx-auto block h-auto max-h-[22rem] w-full"
      role="img"
      aria-label={`Circuit map traced from this race's own car positions${track.corners.length ? ", with turn numbers" : ""}. Markers show where chapters of the race happened.`}
    >
      {/* The track: a soft wide band under a crisp line, drawn in on first view. */}
      <path d={path} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth={14} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
      <motion.path
        d={path}
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

      {highlight && (
        <motion.path
          key={`hl-${active}`}
          d={highlight}
          fill="none"
          stroke={activeColor}
          strokeWidth={5}
          strokeDasharray={activeApprox ? "6 6" : undefined}
          strokeLinecap="round"
          strokeLinejoin="round"
          vectorEffect="non-scaling-stroke"
          initial={reduceMotion ? false : { pathLength: 0, opacity: 0 }}
          animate={{ pathLength: 1, opacity: 1 }}
          transition={{ duration: reduceMotion ? 0 : 0.45, ease: [0.2, 0, 0, 1] }}
        />
      )}

      {sfTick && (
        <g aria-hidden>
          <line
            x1={sfTick.a[0] - sfTick.nx * 10 * unit}
            y1={sfTick.a[1] - sfTick.ny * 10 * unit}
            x2={sfTick.a[0] + sfTick.nx * 10 * unit}
            y2={sfTick.a[1] + sfTick.ny * 10 * unit}
            stroke="rgb(255 255 255 / 0.9)"
            strokeWidth={2.5}
            vectorEffect="non-scaling-stroke"
          />
          <text
            x={sfTick.a[0] + sfTick.nx * 22 * unit}
            y={sfTick.a[1] + sfTick.ny * 22 * unit}
            fontSize={10 * unit}
            fill="rgb(255 255 255 / 0.6)"
            textAnchor="middle"
            dominantBaseline="middle"
          >
            START/FINISH
          </text>
        </g>
      )}

      {/* Turn numbers, pushed outward from the circuit's centre so they sit beside the track, not on it. */}
      {track.corners.map((c) => {
        const [x, y] = proj.toSvg(c.x, c.y);
        const dx = x - centroid[0];
        const dy = y - centroid[1];
        const d = Math.hypot(dx, dy) || 1;
        return (
          <text
            key={`${c.number}${c.letter}`}
            x={x + (dx / d) * 16 * unit}
            y={y + (dy / d) * 16 * unit}
            fontSize={10 * unit}
            fill="rgb(255 255 255 / 0.45)"
            textAnchor="middle"
            dominantBaseline="middle"
            className="tabular"
            aria-hidden
          >
            {c.number}
            {c.letter}
          </text>
        );
      })}

      {/* Chapter markers, the active one last so it paints on top. */}
      {places
        .map((p, i) => ({ p, i }))
        .filter(({ p }) => p.xy)
        .sort((a, b) => (a.i === active ? 1 : b.i === active ? -1 : 0))
        .map(({ p, i }) => {
          const [x, y] = proj.toSvg(p.xy![0], p.xy![1]);
          const isActive = i === active;
          const color = colorFor(chapters[i].driverId);
          const change = p.change;
          // The feed is in decimetres and the projection keeps its scale: an uncertainty of N m is N x 10 units.
          const spread = change?.kind === "pass" && change.precision === "approximate" ? Math.max(change.uncertaintyM * 10, 12 * unit) : null;
          return (
            <g key={i} onClick={() => onSelect(i)} style={{ cursor: "pointer" }} aria-hidden>
              <circle cx={x} cy={y} r={14 * unit} fill="transparent" />
              {spread !== null && (
                <circle cx={x} cy={y} r={spread} fill={color} fillOpacity={0.06} stroke={color} strokeOpacity={0.6} strokeDasharray="3 4" strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
              )}
              {isActive && <circle cx={x} cy={y} r={11 * unit} fill="none" stroke={color} strokeOpacity={0.45} strokeWidth={3} vectorEffect="non-scaling-stroke" />}
              <motion.circle
                cx={x}
                cy={y}
                initial={false}
                animate={{ r: (isActive ? 6.5 : 4.5) * unit }}
                transition={{ duration: reduceMotion ? 0 : 0.2 }}
                fill={isActive ? color : "rgb(10 10 12)"}
                stroke={color}
                strokeWidth={2}
                vectorEffect="non-scaling-stroke"
              />
              {isActive && (
                <text x={x} y={y - 16 * unit} fontSize={11 * unit} fill="white" textAnchor="middle" className="tabular" fontWeight={600}>
                  Lap {chapters[i].lap}
                  {spread !== null ? " · approx." : ""}
                </text>
              )}
            </g>
          );
        })}
    </svg>
  );
}
