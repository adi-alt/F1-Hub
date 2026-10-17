"use client";

import { useId, useState } from "react";
import Link from "next/link";
import { motion } from "motion/react";
import { Crown } from "lucide-react";
import { useRichMotion } from "@/hooks/useRichMotion";
import { archiveSeasonHref } from "@/lib/routes";
import { teamColor } from "@/lib/teamColors";

export type SeasonPoint = {
  year: number;
  points: number;
  wins: number;
  podiums: number;
  races: number;
  /** The team raced for that season (the most-raced one, for a mid-season move). */
  team: string;
  /** Champion that season - only ever true where the archive's points sum is the real title rule (1991 on). */
  champion: boolean;
};

/** The chart's drawing space. The SVG stretches to its box (preserveAspectRatio none) with a non-scaling stroke, and
 * everything round - dots, crowns - is placed over it in HTML by percentage, so nothing is squashed. */
const W = 1000;
const H = 200;
const TOP = 26;
const BOTTOM = 6;
const EASE = [0.22, 1, 0.36, 1] as const;
/** Room on the right for the points labels, so they never sit on the curve's last season. */
const GUTTER = 56;
/** Past this many seasons a dot per season is a bead necklace: only titles (and the hovered season) keep theirs. */
const DOT_LIMIT = 30;

type Pt = { x: number; y: number };

/**
 * A career (or a team's history) as one curve: a season's points (Grand Prix plus sprint) along a monotone cubic
 * through every year, coloured in the team of each season (the colour changes where the team did), with a soft fill
 * beneath and a crown over each title. It draws itself in from the first season to the last as it comes into view,
 * then the points settle onto it. Hovering or focusing a season picks it out and says its line; each season opens
 * that season. Phones and reduced motion get the finished curve.
 */
export function ArchiveSeasonStory({ seasons, subject }: { seasons: SeasonPoint[]; subject: string }) {
  const rich = useRichMotion();
  const uid = useId().replace(/:/g, "");
  const sorted = [...seasons].sort((a, b) => a.year - b.year);
  const [active, setActive] = useState<number | null>(null);
  if (sorted.length === 0) return null;

  const max = Math.max(...sorted.map((s) => s.points), 1);
  const best = sorted.reduce((a, b) => (b.points > a.points ? b : a));
  const titles = sorted.filter((s) => s.champion);
  const shown = sorted.find((s) => s.year === active) ?? null;
  const n = sorted.length;
  const xAt = (i: number) => (n === 1 ? (W - GUTTER) / 2 : 8 + (i * (W - 8 - GUTTER)) / (n - 1));
  const yAt = (p: number) => H - BOTTOM - (p / max) * (H - TOP - BOTTOM);
  const pts: Pt[] = sorted.map((s, i) => ({ x: xAt(i), y: yAt(s.points) }));
  const line = monotonePath(pts);
  const area = `${line} L ${pts[n - 1].x} ${H - BOTTOM} L ${pts[0].x} ${H - BOTTOM} Z`;

  // The stroke's colour follows the team: a stop per season, doubled at the midpoint wherever the team changed, so
  // the colour turns over between the two seasons rather than smearing across the whole stretch.
  const span = Math.max(1, pts[n - 1].x - pts[0].x);
  const off = (x: number) => `${(((x - pts[0].x) / span) * 100).toFixed(2)}%`;
  const stops: { offset: string; color: string }[] = [];
  sorted.forEach((s, i) => {
    const color = teamColor(s.team);
    if (i > 0 && sorted[i - 1].team !== s.team) {
      const mid = (pts[i - 1].x + pts[i].x) / 2;
      stops.push({ offset: off(mid), color: teamColor(sorted[i - 1].team) }, { offset: off(mid), color });
    }
    stops.push({ offset: off(pts[i].x), color });
  });

  const ticks = yearTicks(sorted.map((s) => s.year));
  const drawn = rich ? { initial: { pathLength: 0 }, whileInView: { pathLength: 1 }, viewport: { once: true, amount: 0.4 }, transition: { duration: 1.4, ease: EASE } } : {};

  return (
    <div>
      {/* The headline first (audit §7): the answer, then the shape. */}
      <p className="text-body-sm text-secondary">
        {titles.length > 0 ? (
          <>
            {titles.length === 1 ? "Champion in " : `${titles.length} titles: `}
            <span className="font-semibold text-primary">{titles.map((t) => t.year).join(", ")}</span>.{" "}
          </>
        ) : null}
        Best season: <span className="font-semibold tabular text-primary">{best.year}</span>, {best.points} points
        {best.wins > 0 ? `, ${best.wins} win${best.wins === 1 ? "" : "s"}` : ""}.
      </p>

      <div role="group" aria-label={`${subject}, points season by season`} className="relative mt-5 h-52" onMouseLeave={() => setActive(null)}>
        {/* Two faint guides, at the best season's points and half of it, labelled in Season's mono. */}
        {[1, 0.5].map((f) => (
          <div key={f} aria-hidden className="absolute inset-x-0 border-t border-dashed border-white/[0.06]" style={{ top: `${(yAt(max * f) / H) * 100}%` }}>
            <span className="absolute -top-2.5 right-0 bg-transparent font-mono text-caption tabular text-tertiary">{Math.round(max * f)}</span>
          </div>
        ))}

        <svg aria-hidden viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible">
          <defs>
            <linearGradient id={`${uid}-team`} gradientUnits="userSpaceOnUse" x1={pts[0].x} x2={pts[n - 1].x} y1="0" y2="0">
              {stops.map((s, i) => (
                <stop key={i} offset={s.offset} stopColor={s.color} />
              ))}
            </linearGradient>
            <linearGradient id={`${uid}-fade`} x1="0" x2="0" y1="0" y2="1">
              <stop offset="0%" stopColor="white" stopOpacity="0.28" />
              <stop offset="100%" stopColor="white" stopOpacity="0" />
            </linearGradient>
            <mask id={`${uid}-mask`}>
              <rect x="0" y="0" width={W} height={H} fill={`url(#${uid}-fade)`} />
            </mask>
          </defs>
          <motion.path
            d={area}
            fill={`url(#${uid}-team)`}
            mask={`url(#${uid}-mask)`}
            {...(rich ? { initial: { opacity: 0 }, whileInView: { opacity: 1 }, viewport: { once: true, amount: 0.4 }, transition: { duration: 0.8, delay: 0.7, ease: EASE } } : {})}
          />
          <motion.path d={line} fill="none" stroke={`url(#${uid}-team)`} strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" vectorEffect="non-scaling-stroke" {...drawn} />
        </svg>

        {active !== null && (
          <div aria-hidden className="pointer-events-none absolute inset-y-0 w-px bg-white/15" style={{ left: `${(pts[sorted.findIndex((s) => s.year === active)].x / W) * 100}%` }} />
        )}

        {sorted.map((s, i) => {
          const left = `${(pts[i].x / W) * 100}%`;
          const top = `${(pts[i].y / H) * 100}%`;
          const on = active === s.year;
          const color = teamColor(s.team);
          const dot = n <= DOT_LIMIT || s.champion || on;
          return (
            <div key={s.year}>
              {s.champion && (
                <Crown aria-hidden size={12} className="pointer-events-none absolute -translate-x-1/2 text-warning" style={{ left, top: `calc(${top} - 22px)` }} />
              )}
              {dot && <motion.span
                aria-hidden
                className="pointer-events-none absolute size-2 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-surface-0 transition-transform duration-fast"
                style={{ left, top, background: color, scale: on ? 1.6 : s.champion ? 1.25 : 1 }}
                {...(rich ? { initial: { opacity: 0 }, whileInView: { opacity: 1 }, viewport: { once: true, amount: 0.4 }, transition: { duration: 0.3, delay: 0.25 + (i / n) * 1.1 } } : {})}
              />}
              {/* The season's whole column is its target: easier to hit than a dot, and it opens the season. */}
              <Link
                href={archiveSeasonHref(s.year)}
                aria-label={`${s.year}: ${s.points} points, ${s.wins} wins, ${s.team}${s.champion ? ", champion" : ""}`}
                onMouseEnter={() => setActive(s.year)}
                onFocus={() => setActive(s.year)}
                onBlur={() => setActive(null)}
                className="absolute inset-y-0 -translate-x-1/2 rounded-control focus-visible:outline-2 focus-visible:outline-focus-ring"
                style={{ left, width: `${100 / n}%` }}
              />
            </div>
          );
        })}
      </div>

      <div aria-hidden className="relative mt-2 h-4 font-mono text-caption tabular text-tertiary">
        {ticks.map((year) => {
          const i = sorted.findIndex((s) => s.year === year);
          const x = (xAt(i) / W) * 100;
          return (
            <span key={year} className={`absolute ${i === 0 ? "" : i === n - 1 ? "-translate-x-full" : "-translate-x-1/2"}`} style={{ left: `${x}%` }}>
              {year}
            </span>
          );
        })}
      </div>

      <p className="mt-3 min-h-5 text-caption text-tertiary" aria-live="polite">
        {shown ? (
          <>
            <span className="font-semibold text-primary">{shown.year}</span> · <span className="text-secondary">{shown.team}</span> · {shown.points} points · {shown.wins} win
            {shown.wins === 1 ? "" : "s"}, {shown.podiums} podium{shown.podiums === 1 ? "" : "s"} from {shown.races} race{shown.races === 1 ? "" : "s"}
            {shown.champion ? " · Champion" : ""}
          </>
        ) : (
          "Hover or tab to a season for its line; select it to open that season."
        )}
      </p>
    </div>
  );
}

/** A smooth path through the points that never overshoots them (Fritsch-Carlson monotone cubic): a season's curve
 * can't dip below zero or above its best year between two real seasons, which a plain spline would. */
function monotonePath(p: Pt[]): string {
  const n = p.length;
  if (n === 1) return `M ${p[0].x - 6} ${p[0].y} L ${p[0].x + 6} ${p[0].y}`;
  const dx = p.slice(1).map((q, i) => q.x - p[i].x);
  const slope = p.slice(1).map((q, i) => (q.y - p[i].y) / dx[i]);
  const m = p.map((_, i) => (i === 0 ? slope[0] : i === n - 1 ? slope[n - 2] : slope[i - 1] * slope[i] <= 0 ? 0 : (slope[i - 1] + slope[i]) / 2));
  for (let i = 0; i < n - 1; i++) {
    if (slope[i] === 0) {
      m[i] = 0;
      m[i + 1] = 0;
      continue;
    }
    const a = m[i] / slope[i];
    const b = m[i + 1] / slope[i];
    const h = a * a + b * b;
    if (h > 9) {
      const t = 3 / Math.sqrt(h);
      m[i] = t * a * slope[i];
      m[i + 1] = t * b * slope[i];
    }
  }
  let d = `M ${p[0].x} ${p[0].y}`;
  for (let i = 0; i < n - 1; i++) {
    const h = dx[i] / 3;
    d += ` C ${p[i].x + h} ${p[i].y + m[i] * h} ${p[i + 1].x - h} ${p[i + 1].y - m[i + 1] * h} ${p[i + 1].x} ${p[i + 1].y}`;
  }
  return d;
}

/** The years to label under the curve: the first and last, and between them the decades (or every fifth year for a
 * short career), dropping any that would crowd an end. */
function yearTicks(years: number[]): number[] {
  const first = years[0];
  const last = years[years.length - 1];
  const step = last - first > 25 ? 10 : 5;
  const middle = years.filter((y) => y % step === 0 && y - first >= step * 0.75 && last - y >= step * 0.75);
  return [...new Set([first, ...middle, last])];
}
