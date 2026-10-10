"use client";

import { useEffect, useMemo, useState, type KeyboardEvent } from "react";
import { AnimatePresence, motion, useReducedMotion } from "framer-motion";
import { ChevronLeft, ChevronRight, Crown, Flag, TrendingUp } from "lucide-react";
import { Typewriter } from "@/components/motion/Typewriter";
import type { Chapter, ChapterKind } from "@/lib/raceMoments";
import { matchLeadChange, type RaceTrackStory } from "@/lib/raceTrackStory";
import { layoutAsTrack, seasonRanges, type CircuitLayout } from "@/lib/circuitLayout";
import { DrawnCircuit } from "./DrawnCircuit";
import { placeChapters, RaceCircuitStory, type ChapterPlace } from "./RaceCircuitStory";

const ICON: Record<ChapterKind, typeof Flag> = { start: Flag, lead: Crown, charge: TrendingUp, finish: Flag };
const KIND_LABEL: Record<ChapterKind, string> = { start: "Lights out", lead: "Lead change", charge: "Biggest move", finish: "Chequered flag" };

// The route: a gentle wave across the full width, in a 1000×100 box. Markers are HTML laid over the SVG at
// the same coordinates (in %), so they stay round however wide the chart is.
const W = 1000;
const H = 100;
const routeY = (t: number) => 50 + 30 * Math.sin(t * Math.PI * 3 + 0.5);
const ROUTE = Array.from({ length: 121 }, (_, i) => {
  const t = i / 120;
  return `${i === 0 ? "M" : "L"}${(t * W).toFixed(1)},${routeY(t).toFixed(1)}`;
}).join(" ");

/** Where a chapter happened, in words - only what the track story supports. */
function whereText(chapter: Chapter, place: ChapterPlace | undefined, nameFor: (code: string) => string, lapLengthM: number): string | null {
  if (!place) return null;
  const c = place.change;
  if (chapter.kind === "finish") return place.xy ? "At the timing line." : null;
  if (!c) return null;
  if (c.kind !== "pass") return c.kind === "pit" ? `In the pit lane: ${nameFor(c.from)} pitted, so no pass on track.` : null;
  const metres = `${c.alongM.toLocaleString("en-GB")} m into the lap`;
  // Approximate: only the distance, with how far off it could be - never a turn name or "at the line".
  if (c.precision === "approximate") {
    return `Passed ${nameFor(c.from)} around ${metres} (give or take ${c.uncertaintyM} m: the position samples around the move are far apart).`;
  }
  // Within 100 m of the line, "into the lap" reads oddly at either end: say where it is plainly.
  const atLine = c.alongM < 100 ? "just after the timing line" : lapLengthM - c.alongM < 100 ? "just before the timing line" : null;
  const spot = `Passed ${nameFor(c.from)} ${atLine ?? c.near ?? metres}${atLine || c.near ? ` (${metres})` : ""}`;
  const battle = c.battle ? " After a battle, this is where the move stuck." : "";
  const later = c.recordedLaterS >= 3 ? ` The timing screens showed it ${Math.round(c.recordedLaterS)} s later, at the next timing loop.` : "";
  return `${spot}.${battle}${later}`;
}

/**
 * Key race moments as a storyline. With a validated track story (race_track_stories), the race is drawn on
 * its real circuit and each chapter that happened at one place - an on-track pass, the flag - is marked where
 * it happened; chapters without one (a pit-stop lead change) say why instead. Without one, the race is a
 * winding route from lights out to the flag with each chapter a waypoint at its lap. Either way: select a
 * chapter (click, or ←/→ on the focused list) and its story is told underneath, and the lap chart above marks
 * that lap and follows that driver.
 */
export function RaceStoryline({
  chapters,
  totalLaps,
  colorFor,
  selected,
  onSelect,
  track: ownTrack = null,
  layout = null,
  nameFor = (code) => code,
}: {
  chapters: Chapter[];
  totalLaps: number;
  colorFor: (driverId: string) => string;
  selected: number | null;
  onSelect: (index: number | null) => void;
  track?: RaceTrackStory | null;
  /** The track library's layout for this race's circuit and season: drawn when the race has no story of its own. */
  layout?: CircuitLayout | null;
  nameFor?: (code: string) => string;
}) {
  // The race's own traced track first (with where things happened); else the library's measured layout for its
  // season (the real geometry, nothing located); else the library's drawing; else the route below.
  const track = useMemo(() => ownTrack ?? (layout?.source === "measured" ? layoutAsTrack(layout) : null), [ownTrack, layout]);
  const drawn = !track && layout?.source === "drawn" ? layout : null;
  const reduceMotion = useReducedMotion();
  const [hovered, setHovered] = useState<number | null>(null);
  const [routeEl, setRouteEl] = useState<HTMLDivElement | null>(null);
  const [routeWidth, setRouteWidth] = useState(1000);
  useEffect(() => {
    if (!routeEl) return;
    const ro = new ResizeObserver(([entry]) => setRouteWidth(entry.contentRect.width));
    ro.observe(routeEl);
    return () => ro.disconnect();
  }, [routeEl]);
  const span = Math.max(1, totalLaps - 1);
  const points = useMemo(() => {
    // Each chapter sits at its lap, but never closer than MIN_GAP to its neighbour: laps 1, 2 and 3 (or 44
    // and 45) would otherwise stack into one unreadable cluster. Pushed forward, then pulled back from the end.
    // 36px between marker centres (markers are 28-32px), but never more than an even share of the route.
    const MIN_GAP = Math.min(Math.max(36 / (routeWidth * 0.9), 0.04), 1 / Math.max(1, chapters.length - 1));
    const ts = chapters.map((c) => (c.lap - 1) / span);
    for (let i = 1; i < ts.length; i++) ts[i] = Math.max(ts[i], ts[i - 1] + MIN_GAP);
    if (ts.length) ts[ts.length - 1] = Math.min(ts[ts.length - 1], 1);
    for (let i = ts.length - 2; i >= 0; i--) ts[i] = Math.min(ts[i], ts[i + 1] - MIN_GAP);
    // Inset from the edges so the first and last markers aren't cut off.
    return ts.map((raw) => {
      const t = Math.max(0, Math.min(1, raw));
      const x = 5 + t * 90;
      return { t: x / 100, x, y: (routeY(x / 100) / H) * 100 };
    });
  }, [chapters, span, routeWidth]);
  const places = useMemo(
    () => (track ? placeChapters(chapters, track, (lap, driver) => matchLeadChange(track, lap, driver)) : null),
    [chapters, track],
  );
  if (chapters.length === 0) return null;

  const active = selected ?? 0;
  const chapter = chapters[active];
  const progress = points[active]?.t ?? 0;
  const go = (i: number) => onSelect(Math.max(0, Math.min(chapters.length - 1, i)));
  function onKey(e: KeyboardEvent) {
    if (e.key === "ArrowRight") go(active + 1);
    else if (e.key === "ArrowLeft") go(active - 1);
    else if (e.key === "Home") go(0);
    else if (e.key === "End") go(chapters.length - 1);
    else if (e.key === "Escape") onSelect(null);
    else return;
    e.preventDefault();
  }

  return (
    <section aria-label="The race as a story">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-xs font-semibold uppercase tracking-[0.16em] text-tertiary">How the race unfolded</p>
        <p className="text-caption text-tertiary">
          {ownTrack
            ? "Where it happened, on this race's own track"
            : layout?.source === "measured"
              ? `Traced from F1 timing data (${seasonRanges(layout.seasons)})`
              : drawn
                ? `The circuit as raced in ${seasonRanges(drawn.seasons)}`
                : "Pick a moment to follow it on the chart"}
        </p>
      </div>

      {(track && places) || drawn ? (
        <div className="mt-4">
          {track && places ? (
            <RaceCircuitStory track={track} chapters={chapters} places={places} active={active} colorFor={colorFor} onSelect={onSelect} />
          ) : (
            drawn && <DrawnCircuit layout={drawn} />
          )}
          {/* Every chapter, located or not: the selectable list behind the map. */}
          <div
            role="listbox"
            aria-label="Race moments"
            aria-activedescendant={`chapter-${active}`}
            tabIndex={0}
            onKeyDown={onKey}
            className="mt-4 flex flex-wrap justify-center gap-1.5 rounded-control focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-white/25"
          >
            {chapters.map((c, i) => {
              const Icon = ICON[c.kind];
              const isActive = i === active;
              return (
                <button
                  key={`${c.kind}-${c.lap}-${i}`}
                  id={`chapter-${i}`}
                  role="option"
                  aria-selected={isActive}
                  aria-label={`Lap ${c.lap}: ${c.title}`}
                  tabIndex={-1}
                  type="button"
                  onClick={() => onSelect(i)}
                  className={`flex items-center gap-1.5 rounded-control border px-2 py-1 text-caption tabular transition-colors duration-fast ${isActive ? "border-white/40 bg-white/[0.06] text-primary" : "border-subtle text-secondary hover:text-primary"}`}
                >
                  <Icon aria-hidden size={12} strokeWidth={2} style={{ color: colorFor(c.driverId) }} />
                  L{c.lap}
                  {!places?.[i]?.xy && <span className="sr-only"> (no single location)</span>}
                </button>
              );
            })}
          </div>
        </div>
      ) : (
      <div
        ref={setRouteEl}
        role="listbox"
        aria-label="Race moments"
        aria-activedescendant={`chapter-${active}`}
        tabIndex={0}
        onKeyDown={onKey}
        className="relative mt-4 h-28 rounded-control focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-focus-ring"
      >
        <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="absolute inset-0 h-full w-full overflow-visible" aria-hidden>
          <path d={ROUTE} fill="none" stroke="rgb(255 255 255 / 0.14)" strokeWidth={1.5} strokeDasharray="2 6" strokeLinecap="round" vectorEffect="non-scaling-stroke" />
          <motion.path
            d={ROUTE}
            fill="none"
            stroke="rgb(255 255 255 / 0.6)"
            strokeWidth={1.5}
            strokeLinecap="round"
            vectorEffect="non-scaling-stroke"
            initial={reduceMotion ? false : { pathLength: 0 }}
            whileInView={{ pathLength: Math.max(progress, 0.001) }}
            animate={{ pathLength: Math.max(progress, 0.001) }}
            viewport={{ once: true }}
            transition={{ duration: reduceMotion ? 0 : 0.7, ease: [0.2, 0, 0, 1] }}
          />
        </svg>

        <span className="absolute -bottom-2 left-0 text-caption text-tertiary">Lap 1</span>
        <span className="absolute -bottom-2 right-0 text-caption text-tertiary">Lap {totalLaps}</span>

        {chapters.map((c, i) => {
          const p = points[i];
          const Icon = ICON[c.kind];
          const isActive = i === active;
          const color = colorFor(c.driverId);
          return (
            <motion.button
              key={`${c.kind}-${c.lap}-${i}`}
              id={`chapter-${i}`}
              role="option"
              aria-selected={isActive}
              aria-label={`Lap ${c.lap}: ${c.title}`}
              tabIndex={-1}
              type="button"
              onClick={() => onSelect(i)}
              onMouseEnter={() => setHovered(i)}
              onMouseLeave={() => setHovered(null)}
              className={`absolute flex size-7 -translate-x-1/2 sm:size-8 -translate-y-1/2 items-center justify-center rounded-full border bg-surface-1 transition-[border-color,box-shadow] duration-fast ${isActive ? "border-white/70" : "border-white/15 hover:border-white/40"}`}
              style={{ left: `${p.x}%`, top: `${p.y}%`, boxShadow: isActive ? `0 0 0 3px ${color}40` : undefined }}
              initial={reduceMotion ? false : { opacity: 0, scale: 0.6 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.3, delay: reduceMotion ? 0 : 0.15 + i * 0.08, ease: "easeOut" }}
            >
              <Icon aria-hidden size={14} strokeWidth={2} style={{ color }} />
              {hovered === i && !isActive && (
                <span className="pointer-events-none absolute bottom-full mb-2 whitespace-nowrap rounded-control surface-glass px-2 py-1 text-caption text-primary">
                  Lap {c.lap} · {c.title}
                </span>
              )}
            </motion.button>
          );
        })}
      </div>
      )}

      {/* The chapter */}
      <div className="mt-6 flex items-start gap-4">
        <span aria-hidden className="mt-1 h-10 w-0.5 shrink-0 rounded-full" style={{ background: colorFor(chapter.driverId) }} />
        <AnimatePresence mode="wait" initial={false}>
          <motion.div
            key={active}
            className="min-w-0 flex-1"
            aria-live="polite"
            initial={reduceMotion ? false : { opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={reduceMotion ? undefined : { opacity: 0, y: -4 }}
            transition={{ duration: 0.18 }}
          >
            <p className="text-caption text-tertiary">
              Chapter {active + 1} of {chapters.length} · Lap {chapter.lap} · {KIND_LABEL[chapter.kind]}
            </p>
            <p className="mt-1 text-body font-semibold text-primary">{chapter.title}</p>
            <p className="mt-1 text-body-sm text-secondary">
              <Typewriter text={chapter.story} msPerChar={12} />
            </p>
            {(() => {
              const where = whereText(chapter, places?.[active], nameFor, track?.lapLengthM ?? 0);
              return where ? <p className="mt-1.5 text-caption text-tertiary">{where}</p> : null;
            })()}
          </motion.div>
        </AnimatePresence>
        <div className="flex shrink-0 gap-1">
          <button type="button" aria-label="Previous moment" disabled={active === 0} onClick={() => go(active - 1)} className="flex size-8 items-center justify-center rounded-control border border-subtle text-secondary transition-colors hover:text-primary disabled:opacity-30">
            <ChevronLeft aria-hidden size={16} />
          </button>
          <button type="button" aria-label="Next moment" disabled={active === chapters.length - 1} onClick={() => go(active + 1)} className="flex size-8 items-center justify-center rounded-control border border-subtle text-secondary transition-colors hover:text-primary disabled:opacity-30">
            <ChevronRight aria-hidden size={16} />
          </button>
        </div>
      </div>
    </section>
  );
}
