"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { teamColor } from "@/lib/teamColors";
import { generateTrackShape, type TrackShape } from "@/lib/trackShape";
import type { TrackType } from "@/lib/circuitFacts";
import type { RaceResultEntry, TireStint } from "@/lib/types/race";

type SimCar = {
  driver: string;
  driverName: string;
  team: string;
  gridRank: number;
  finishRank: number;
  dnf: boolean;
  /** Real classified gap-to-leader in seconds, when this race has one - shown in the driver
   * tower, never fabricated for a race that doesn't have it. */
  finishGapSec: number | null;
  /** Real pit-stop lap fractions (0-1 of this driver's own race distance) from tire_stints - shown
   * as track-side pit markers only, never used to infer an intermediate rank this app has no data
   * for. */
  pitFractions: number[];
};

const CIRCULATION_SECONDS = 5.5; // one full lively "lap" of visual circulation, independent of real duration
const SPEED_OPTIONS = [1, 2, 5] as const;
type Speed = (typeof SPEED_OPTIONS)[number];
type PlaybackView = "race" | "qualifying";

function easeInOutCubic(t: number): number {
  return t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2;
}

/** Builds the deterministic per-car simulation input from real classification + real stint data.
 * A driver with no grid (DNS) or no finish classification is dropped rather than guessed at. */
function buildSimCars(results: RaceResultEntry[], stints: TireStint[]): SimCar[] {
  const stintsByDriver = new Map<string, TireStint[]>();
  for (const s of stints) {
    const list = stintsByDriver.get(s.driver) ?? [];
    list.push(s);
    stintsByDriver.set(s.driver, list);
  }

  const cars: SimCar[] = [];
  for (const r of results) {
    if (r.grid == null) continue;
    const own = (stintsByDriver.get(r.driver) ?? []).sort((a, b) => a.stintNumber - b.stintNumber);
    const totalLaps = own.reduce((sum, s) => sum + s.lapCount, 0);
    const pitFractions: number[] = [];
    if (totalLaps > 0) {
      let cumulative = 0;
      // A pit happens at the END of every stint but the last one - the boundary between stints,
      // not their own count.
      for (let i = 0; i < own.length - 1; i++) {
        cumulative += own[i].lapCount;
        pitFractions.push(cumulative / totalLaps);
      }
    }
    cars.push({
      driver: r.driver,
      driverName: r.driverName,
      team: r.team,
      gridRank: r.grid,
      finishRank: r.finishPosition,
      dnf: r.status === "dnf",
      finishGapSec: r.finishGapSec,
      pitFractions,
    });
  }
  return cars;
}

/** Where a car sits along the closed path right now: a shared fast circulation angle (so the pack
 * visually moves, the way a real field does) minus this car's own gap-to-leader fraction, which
 * itself is interpolated between its real grid and real finish rank over the course of the replay.
 * Nothing here claims to know a driver's position DURING the race - only its two real endpoints. */
function carProgress(car: SimCar, totalCars: number, circulationT: number, raceT: number, maxGapSpread: number): number {
  const gridGap = ((car.gridRank - 1) / Math.max(1, totalCars - 1)) * maxGapSpread;
  const finishGap = ((car.finishRank - 1) / Math.max(1, totalCars - 1)) * maxGapSpread;
  const gap = gridGap + (finishGap - gridGap) * easeInOutCubic(raceT);
  return ((circulationT - gap) % 1 + 1) % 1;
}

function pointAlong(shape: TrackShape, pathEl: SVGPathElement | null, t: number): { x: number; y: number } {
  if (!pathEl) return shape.startFinish;
  const total = pathEl.getTotalLength();
  const p = pathEl.getPointAtLength(((t % 1) + 1) % 1 * total);
  return { x: p.x, y: p.y };
}

export function TrackMap({
  seed,
  turns,
  trackType,
  results,
  tireStints,
  raceLabel,
}: {
  /** Stable per-circuit seed for the deterministic schematic shape - the circuit's own real
   * location string is used by callers, so the same circuit always draws the same layout. */
  seed: string;
  turns: number;
  trackType: TrackType;
  /** Null when there is no completed race for this circuit to simulate - the track still renders,
   * just without cars, per the "upcoming circuit" state. */
  results: RaceResultEntry[] | null;
  tireStints: TireStint[] | null;
  raceLabel: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const pathRef = useRef<SVGPathElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(reduceMotion ?? false);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);
  const [view, setView] = useState<PlaybackView>("race");
  const [visible, setVisible] = useState(true);
  const [raceT, setRaceT] = useState(0); // 0..1 across the whole simulated replay
  const [, forceTick] = useState(0); // re-render each frame for circulation without storing every frame in state

  const shape = useMemo(() => generateTrackShape(seed, turns, trackType), [seed, turns, trackType]);
  const cars = useMemo(() => buildSimCars(results ?? [], tireStints ?? []), [results, tireStints]);
  const hasSimulation = cars.length > 0;

  // Draw the track in once, quickly, on mount - skipped entirely under reduced motion (the shape
  // is just there immediately) rather than reduced-but-still-animated.
  useEffect(() => {
    if (reduceMotion) {
      setDrawn(true);
      // Reduced motion turns off the PLAYBACK, not the information - without this, cars would sit
      // at raceT=0 (grid order) forever, since the animation loop that normally carries raceT to
      // 1 never runs when motion is reduced. Jumping straight to the real classified result is
      // what "static, not moving" should mean here, not "frozen at the start".
      setRaceT(1);
      setPlaying(false);
      return;
    }
    const t = window.setTimeout(() => setDrawn(true), 60);
    return () => window.clearTimeout(t);
  }, [reduceMotion]);

  // Pause when the tab is hidden or the map has scrolled off-screen - a car animation nobody is
  // looking at should not keep re-rendering every frame.
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { threshold: 0.1 });
    io.observe(el);
    const onVisibility = () => setVisible(!document.hidden);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      io.disconnect();
      document.removeEventListener("visibilitychange", onVisibility);
    };
  }, []);

  const animationActive = hasSimulation && playing && visible && !reduceMotion;

  // The replay's own progress (grid -> finish), independent of the fast circulation loop above -
  // this is what "1x/2x/5x" actually controls. ~14s at 1x is enough to read the shift from grid to
  // finish without feeling rushed or dragging.
  useEffect(() => {
    if (!animationActive) return;
    const REPLAY_SECONDS = 14;
    let raf: number;
    let last = performance.now();
    function step(now: number) {
      const dt = (now - last) / 1000;
      last = now;
      setRaceT((prev) => Math.min(1, prev + (dt / REPLAY_SECONDS) * speed));
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [animationActive, speed]);

  // The fast, purely visual circulation clock - re-renders every frame while active, cheaply (one
  // number, no layout work beyond repositioning already-mounted dots).
  useEffect(() => {
    if (!animationActive) return;
    let raf: number;
    function step() {
      forceTick((n) => (n + 1) % 100000);
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [animationActive]);

  const circulationT = hasSimulation ? (performance.now() / 1000 / CIRCULATION_SECONDS) % 1 : 0;
  const maxGapSpread = 0.3; // the whole field spans at most 30% of the loop's circumference

  function restart() {
    setRaceT(0);
    setPlaying(true);
  }

  return (
    <div ref={containerRef}>
      <div className="relative w-full overflow-hidden rounded-md border border-white/[0.07] bg-white/[0.015]" style={{ aspectRatio: "4 / 3" }}>
        <svg viewBox="0 0 100 100" className="h-full w-full" role="img" aria-label={`Stylized layout of the circuit, ${turns} turns${raceLabel ? `, showing ${raceLabel}` : ""}`}>
          <path
            ref={pathRef}
            d={shape.path}
            fill="none"
            stroke="rgba(255,255,255,0.28)"
            strokeWidth={1.4}
            strokeLinecap="round"
            pathLength={1}
            style={
              reduceMotion
                ? undefined
                : {
                    strokeDasharray: 1,
                    strokeDashoffset: drawn ? 0 : 1,
                    transition: "stroke-dashoffset 0.7s ease-out",
                  }
            }
          />
          {/* Start/finish */}
          <line
            x1={shape.startFinish.x}
            y1={shape.startFinish.y - 2.2}
            x2={shape.startFinish.x}
            y2={shape.startFinish.y + 2.2}
            stroke="var(--f1-red)"
            strokeWidth={0.9}
            opacity={drawn ? 1 : 0}
            style={{ transition: "opacity 0.3s ease-out 0.5s" }}
          />

          {drawn &&
            shape.turns.map((t) => (
              <g key={t.number} opacity={0.75}>
                <circle cx={t.x} cy={t.y} r={1.1} fill="rgba(255,255,255,0.35)" />
                <text x={t.x} y={t.y - 2.4} fontSize={2.6} textAnchor="middle" fill="rgba(255,255,255,0.4)">
                  {t.number}
                </text>
              </g>
            ))}

          {/* Real pit-stop lap markers - small ticks near the loop, never presented as live cars. */}
          {drawn &&
            cars.flatMap((c) =>
              c.pitFractions.map((f, i) => {
                const p = pointAlong(shape, pathRef.current, f);
                return <circle key={`${c.driver}-pit-${i}`} cx={p.x} cy={p.y} r={0.6} fill="rgba(234,179,8,0.55)" />;
              }),
            )}

          {drawn &&
            hasSimulation &&
            cars.map((c) => {
              const t = view === "qualifying" ? ((c.gridRank - 1) / Math.max(1, cars.length - 1)) * maxGapSpread : carProgress(c, cars.length, circulationT, raceT, maxGapSpread);
              const p = view === "qualifying" ? pointAlong(shape, pathRef.current, circulationT - t) : pointAlong(shape, pathRef.current, t);
              const color = teamColor(c.team);
              return (
                <circle
                  key={c.driver}
                  cx={p.x}
                  cy={p.y}
                  r={c.finishRank <= 3 ? 1.7 : 1.3}
                  fill={color}
                  stroke="rgba(0,0,0,0.5)"
                  strokeWidth={0.3}
                  opacity={c.dnf && raceT > 0.05 ? 0.25 : 1}
                />
              );
            })}
        </svg>

        {hasSimulation && (
          <span className="absolute bottom-2 left-2 rounded-full border border-white/[0.14] bg-black/50 px-2 py-0.5 text-[9px] font-medium text-neutral-400 backdrop-blur-sm">
            Simulated from grid, finish &amp; pit data — not live telemetry
          </span>
        )}
        {!hasSimulation && (
          <span className="absolute bottom-2 left-2 rounded-full border border-white/[0.14] bg-black/50 px-2 py-0.5 text-[9px] font-medium text-neutral-400 backdrop-blur-sm">
            Stylized layout — schematic, not to scale
          </span>
        )}
      </div>

      {/* No playback controls at all under reduced motion - there's genuinely nothing to control
          (raceT is pinned at the final result, permanently, rather than offering a Restart that
          would only strand the view back at the grid with no animation left to advance it out of
          that state again). */}
      {hasSimulation && !reduceMotion && (
        <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-1" role="group" aria-label="Playback view">
            {(["race", "qualifying"] as const).map((v) => (
              <button
                key={v}
                type="button"
                onClick={() => setView(v)}
                aria-pressed={view === v}
                className={`rounded-full px-2.5 py-1 text-[11px] font-medium capitalize transition ${
                  view === v ? "bg-white/[0.1] text-white" : "text-neutral-500 hover:text-neutral-300"
                }`}
              >
                {v}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => (raceT >= 1 ? restart() : setPlaying((p) => !p))}
              aria-label={playing ? "Pause simulation" : "Play simulation"}
              className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-neutral-300 transition hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
            >
              {raceT >= 1 ? <RestartIcon /> : playing ? <PauseIcon /> : <PlayIcon />}
            </button>
            <div className="flex items-center gap-0.5" role="group" aria-label="Playback speed">
              {SPEED_OPTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => setSpeed(s)}
                  aria-pressed={speed === s}
                  className={`rounded-full px-2 py-1 text-[11px] font-medium tabular-nums transition ${
                    speed === s ? "bg-white/[0.1] text-white" : "text-neutral-500 hover:text-neutral-300"
                  }`}
                >
                  {s}x
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 16 16" className="ml-0.5 h-3 w-3" fill="currentColor" aria-hidden>
      <path d="M4 2.5v11l10-5.5z" />
    </svg>
  );
}
function PauseIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden>
      <rect x="3.5" y="2.5" width="3" height="11" />
      <rect x="9.5" y="2.5" width="3" height="11" />
    </svg>
  );
}
function RestartIcon() {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="none" stroke="currentColor" strokeWidth="1.4" aria-hidden>
      <path d="M13 8A5 5 0 1 1 8 3" strokeLinecap="round" />
      <path d="M8 1v3.2h3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

/** The compact timing tower - position, driver, team, and a REAL classified gap where the race has
 * one (never a fabricated intermediate gap). Sits beside the track map, not on top of it. */
export function DriverTower({ results }: { results: RaceResultEntry[] }) {
  const ranked = [...results].filter((r) => r.grid != null).sort((a, b) => a.finishPosition - b.finishPosition);
  if (ranked.length === 0) return null;

  return (
    <ol className="divide-y divide-white/[0.055]">
      {ranked.slice(0, 10).map((r) => (
        <li key={r.driver} className="flex items-center gap-2.5 py-1.5 text-sm">
          <span className="w-5 shrink-0 font-mono text-[11px] tabular-nums text-neutral-600">P{r.finishPosition}</span>
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: teamColor(r.team) }} />
          <span className="min-w-0 flex-1 truncate text-neutral-200">{r.driverName}</span>
          <span className="shrink-0 font-mono text-[11px] tabular-nums text-neutral-500">
            {r.status === "dnf" ? "DNF" : r.finishPosition === 1 ? "Leader" : r.finishGapSec != null ? `+${r.finishGapSec.toFixed(1)}s` : "—"}
          </span>
        </li>
      ))}
    </ol>
  );
}
