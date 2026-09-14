"use client";

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useReducedMotion } from "framer-motion";
import { teamColor } from "@/lib/teamColors";
import { generateTrackShape, type TrackShape } from "@/lib/trackShape";
import { parseTimeToSeconds } from "@/lib/parseTimeToSeconds";
import type { TrackType } from "@/lib/circuitFacts";
import type { RaceResultEntry, TireStint } from "@/lib/types/race";
import type { RaceLapEntry } from "@/lib/supabase/races";

type LapRank = { lap: number; position: number };
type StintRange = { compound: string; startLap: number; endLap: number };

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
  /** Real pit-stop lap fractions (0-1 of this driver's own race distance) from tire_stints. */
  pitFractions: number[];
  /** Real classified position at each lap this driver has a `race_laps` row for, sorted - empty
   * for a race the lap backfill hasn't reached, in which case this car degrades gracefully to a
   * two-point grid->finish interpolation (see rankAtLapT). */
  lapRanks: LapRank[];
  /** Real cumulative tyre-stint lap ranges, derived from tire_stints the same way pitFractions
   * is - never a per-lap compound reading (this app has none), only "which stint covers this
   * lap." */
  stints: StintRange[];
};

type RenderCar = { driver: string; x: number; y: number; team: string; finishRank: number; dnf: boolean; rank: number };
type RenderPit = { key: string; x: number; y: number };

const CIRCULATION_SECONDS = 5.5; // one full lively "lap" of visual circulation, independent of real duration
const REPLAY_SECONDS = 22; // how long a full grid -> finish replay takes at 1x
const SPEED_OPTIONS = [0.5, 1, 2, 5, 10] as const;
type Speed = (typeof SPEED_OPTIONS)[number];

/** Builds the deterministic per-car simulation input from real classification, real stint data,
 * and (when the backfill has reached this race) real lap-by-lap classified positions. A driver
 * with no grid (DNS) or no finish classification is dropped rather than guessed at. */
function buildSimCars(results: RaceResultEntry[], stints: TireStint[], raceLaps: RaceLapEntry[]): SimCar[] {
  const stintsByDriver = new Map<string, TireStint[]>();
  for (const s of stints) {
    const list = stintsByDriver.get(s.driver) ?? [];
    list.push(s);
    stintsByDriver.set(s.driver, list);
  }

  const lapRanksByDriver = new Map<string, LapRank[]>();
  for (const entry of raceLaps) {
    for (const t of entry.timings) {
      if (t.position == null) continue;
      const list = lapRanksByDriver.get(t.driverId) ?? [];
      list.push({ lap: entry.lap, position: t.position });
      lapRanksByDriver.set(t.driverId, list);
    }
  }
  for (const list of lapRanksByDriver.values()) list.sort((a, b) => a.lap - b.lap);

  const cars: SimCar[] = [];
  for (const r of results) {
    if (r.grid == null) continue;
    const own = (stintsByDriver.get(r.driver) ?? []).sort((a, b) => a.stintNumber - b.stintNumber);
    const totalLaps = own.reduce((sum, s) => sum + s.lapCount, 0);
    const pitFractions: number[] = [];
    const stintRanges: StintRange[] = [];
    if (totalLaps > 0) {
      let cumulative = 0;
      for (let i = 0; i < own.length; i++) {
        const startLap = cumulative + 1;
        cumulative += own[i].lapCount;
        stintRanges.push({ compound: own[i].compound, startLap, endLap: cumulative });
        // A pit happens at the END of every stint but the last one - the boundary between
        // stints, not their own count.
        if (i < own.length - 1) pitFractions.push(cumulative / totalLaps);
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
      lapRanks: lapRanksByDriver.get(r.driver) ?? [],
      stints: stintRanges,
    });
  }
  return cars;
}

/** Real classified position at a continuous lap-progress value, interpolated between whichever
 * REAL anchors this car actually has (grid at lap 0, every classified lap `race_laps` covers,
 * finish at the last lap) - not a two-point guess when the fuller data exists, but degrading
 * cleanly to exactly that two-point interpolation when it doesn't (a car with zero real lapRanks
 * has exactly two anchors, which is the original grid->finish behavior). Every anchor is a REAL
 * classified rank; nothing between two real anchors claims to be more than a straight line. */
function rankAtLapT(car: SimCar, lapT: number, totalLaps: number): number {
  const anchors: { lap: number; rank: number }[] = [{ lap: 0, rank: car.gridRank }, ...car.lapRanks.map((r) => ({ lap: r.lap, rank: r.position })), { lap: Math.max(totalLaps, 1), rank: car.finishRank }];
  anchors.sort((a, b) => a.lap - b.lap);
  if (lapT <= anchors[0].lap) return anchors[0].rank;
  for (let i = 1; i < anchors.length; i++) {
    if (lapT <= anchors[i].lap) {
      const a = anchors[i - 1];
      const b = anchors[i];
      if (b.lap === a.lap) return b.rank;
      const frac = (lapT - a.lap) / (b.lap - a.lap);
      return a.rank + (b.rank - a.rank) * frac;
    }
  }
  return anchors[anchors.length - 1].rank;
}

/** The lap this car last has a real classified position for - where a DNF's dot should freeze
 * and fade, not an arbitrary fixed fraction of the replay. Falls back to a small fixed fraction
 * only when there's no real lap data to anchor it to at all. */
function retiredAtLapT(car: SimCar, totalLaps: number): number {
  if (car.lapRanks.length > 0) return car.lapRanks[car.lapRanks.length - 1].lap;
  return Math.max(totalLaps, 1) * 0.05;
}

function angleForRank(rank: number, totalCars: number, circulationT: number, maxGapSpread: number): number {
  const gapFrac = ((rank - 1) / Math.max(1, totalCars - 1)) * maxGapSpread;
  return (((circulationT - gapFrac) % 1) + 1) % 1;
}

function pointAlong(shape: TrackShape, pathEl: SVGPathElement | null, t: number): { x: number; y: number } {
  if (!pathEl) return shape.startFinish;
  const total = pathEl.getTotalLength();
  const p = pathEl.getPointAtLength((((t % 1) + 1) % 1) * total);
  return { x: p.x, y: p.y };
}

/** Pure position computation - takes the path ELEMENT as a plain argument rather than reading a
 * ref itself, so it can be called from wherever a ref read is actually allowed (an effect, a
 * rAF callback), never from the render body directly - React's rules-of-hooks lint enforces this
 * (refs and impure calls like performance.now() may not be read during render). */
function computeCarPositions(shape: TrackShape, pathEl: SVGPathElement | null, cars: SimCar[], lapT: number, totalLaps: number, circulationT: number, maxGapSpread: number): RenderCar[] {
  return cars.map((c) => {
    const rank = rankAtLapT(c, lapT, totalLaps);
    const t = angleForRank(rank, cars.length, circulationT, maxGapSpread);
    const p = pointAlong(shape, pathEl, t);
    return { driver: c.driver, x: p.x, y: p.y, team: c.team, finishRank: c.finishRank, dnf: c.dnf, rank };
  });
}

function computePitPositions(shape: TrackShape, pathEl: SVGPathElement | null, cars: SimCar[]): RenderPit[] {
  return cars.flatMap((c) => c.pitFractions.map((f, i) => ({ key: `${c.driver}-pit-${i}`, ...pointAlong(shape, pathEl, f) })));
}

function compoundAtLap(car: SimCar, lap: number): string | null {
  return car.stints.find((s) => lap >= s.startLap && lap <= s.endLap)?.compound ?? null;
}

/** Real cumulative race time per driver per lap, built once from `race_laps.time` (a real lap
 * time, never a result-row "+2 Laps" style gap - see parseTimeToSeconds's own docstring on why
 * that distinction matters). Once a lap's time is missing for a driver, every later lap for them
 * is also marked unavailable rather than silently summing a gap in coverage into a wrong number -
 * a partial sum that looks like a real gap would be worse than admitting the gap isn't known. */
function buildCumulativeTime(raceLaps: RaceLapEntry[]): Map<string, Map<number, number>> {
  const byDriver = new Map<string, { lap: number; time: string | null }[]>();
  for (const entry of raceLaps) {
    for (const t of entry.timings) {
      const list = byDriver.get(t.driverId) ?? [];
      list.push({ lap: entry.lap, time: t.time });
      byDriver.set(t.driverId, list);
    }
  }
  const result = new Map<string, Map<number, number>>();
  for (const [driver, laps] of byDriver) {
    laps.sort((a, b) => a.lap - b.lap);
    const cum = new Map<number, number>();
    let running = 0;
    let broken = false;
    for (const { lap, time } of laps) {
      const sec = parseTimeToSeconds(time);
      if (sec === null) broken = true;
      if (!broken) {
        running += sec as number;
        cum.set(lap, running);
      }
    }
    result.set(driver, cum);
  }
  return result;
}

function gapToLeaderAt(driver: string, lap: number, cumTime: Map<string, Map<number, number>>): number | null {
  const own = cumTime.get(driver)?.get(lap);
  if (own == null) return null;
  let leader = Infinity;
  for (const m of cumTime.values()) {
    const v = m.get(lap);
    if (v != null && v < leader) leader = v;
  }
  if (!Number.isFinite(leader)) return null;
  return own - leader;
}

/** The hover/select tooltip, drawn INSIDE the SVG at the active car's own real position rather
 * than as a separate fixed info panel below the map - it tracks the car (including mid-replay,
 * since it reads the same per-frame `render` position everything else on the map does), and its
 * every size is `uiScale`-relative so it reads correctly regardless of which circuit's own
 * measured viewBox is active. Clamped to stay inside the viewBox rather than running off the edge
 * for a car near the boundary. */
function CarTooltip({
  car,
  render,
  currentLap,
  gap,
  compound,
  uiScale,
  vbX,
  vbY,
  vbW,
  vbH,
}: {
  car: SimCar;
  render: RenderCar;
  currentLap: number | null;
  gap: number | null;
  compound: string | null;
  uiScale: number;
  vbX: number;
  vbY: number;
  vbW: number;
  vbH: number;
}) {
  const statsLine = [currentLap ? `Lap ${currentLap}` : null, `P${Math.round(render.rank)}`, gap != null ? (gap <= 0.05 ? "Leader" : `+${gap.toFixed(1)}s`) : null, compound]
    .filter((v): v is string => !!v)
    .join("  ·  ");

  const boxW = 46 * uiScale;
  const lineH = 4.4 * uiScale;
  const padY = 1.8 * uiScale;
  const boxH = padY * 2 + lineH * 2;

  // Flip below the car if it's in the top ~22% of the box (nowhere above it to draw into), clamp
  // horizontally so the box never runs past either edge.
  const flipBelow = render.y - vbY < vbH * 0.22;
  const boxY = flipBelow ? render.y + 3.5 * uiScale : render.y - 3.5 * uiScale - boxH;
  const boxX = Math.min(Math.max(render.x - boxW / 2, vbX + 0.5 * uiScale), vbX + vbW - boxW - 0.5 * uiScale);
  const textX = boxX + boxW / 2;

  return (
    <g style={{ pointerEvents: "none" }}>
      <rect x={boxX} y={boxY} width={boxW} height={boxH} rx={1.2 * uiScale} fill="rgba(8,8,10,0.92)" stroke="rgba(255,255,255,0.14)" strokeWidth={0.2 * uiScale} />
      <text x={textX} y={boxY + padY + lineH * 0.62} textAnchor="middle" fontSize={3.1 * uiScale} fontWeight={700} fill="white">
        {car.driverName} · {car.team}
      </text>
      <text x={textX} y={boxY + padY + lineH * 1.62} textAnchor="middle" fontSize={2.7 * uiScale} fill="rgba(255,255,255,0.65)">
        {statsLine}
      </text>
    </g>
  );
}

export function TrackMap({
  seed,
  turns,
  trackType,
  results,
  tireStints,
  raceLaps,
  raceLabel,
}: {
  /** Stable per-circuit seed for the deterministic schematic shape (or the lookup key for real
   * authentic geometry, when circuitShapes.json covers this circuit) - the circuit's own real
   * location string. */
  seed: string;
  turns: number;
  trackType: TrackType;
  /** Null when there is no completed race for this circuit to simulate - the track still renders,
   * just without cars, per the "upcoming circuit" state. */
  results: RaceResultEntry[] | null;
  tireStints: TireStint[] | null;
  /** Real per-lap classification for `results`' own race - empty when the lap backfill hasn't
   * reached it yet, in which case the replay degrades to a labeled grid->finish interpolation. */
  raceLaps: RaceLapEntry[] | null;
  raceLabel: string | null;
}) {
  const reduceMotion = useReducedMotion();
  const pathRef = useRef<SVGPathElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [drawn, setDrawn] = useState(reduceMotion ?? false);
  const [playing, setPlaying] = useState(true);
  const [speed, setSpeed] = useState<Speed>(1);
  const [visible, setVisible] = useState(true);
  const [raceT, setRaceT] = useState(0); // 0..1 across the whole simulated replay
  const [renderCars, setRenderCars] = useState<RenderCar[]>([]);
  const [renderPits, setRenderPits] = useState<RenderPit[]>([]);
  const [hoverDriver, setHoverDriver] = useState<string | null>(null);
  const [selectedDriver, setSelectedDriver] = useState<string | null>(null);

  // A plain mirror of raceT for the animation loop below to read without needing to restart
  // itself every time it changes (which putting it in that effect's own dependency array would
  // otherwise force, tearing the rAF loop down and recreating it every single frame).
  const raceTRef = useRef(raceT);
  useEffect(() => {
    raceTRef.current = raceT;
  }, [raceT]);

  const shape = useMemo(() => generateTrackShape(seed, turns, trackType), [seed, turns, trackType]);

  // Real authentic geometry's declared viewBox (0 0 1000 1000, from the source dataset) does NOT
  // tightly bound the actual path - confirmed live across every circuit (Silverstone's real
  // coordinates run -128 to 899, Monza -230 to 954, etc.), which is why the track used to render
  // small and shoved into the top-left corner instead of centered: SVG doesn't auto-crop to
  // content, so declared-but-unused viewBox space just renders as empty space, and any real
  // coordinate below 0 (every circuit has some) was being silently clipped outright. getBBox()
  // reads the path's own true rendered bounds directly from the browser's geometry engine -
  // exact, not an approximation - and this recomputes a tight viewBox from that, in a
  // useLayoutEffect (runs before paint, so there's no visible jump from the declared box to the
  // corrected one). The schematic fallback's own procedurally-generated "0 0 100 100" box is
  // already tight by construction, so this only ever has real work to do for authentic geometry.
  const [tightViewBox, setTightViewBox] = useState<string | null>(null);
  useLayoutEffect(() => {
    const el = pathRef.current;
    if (!el || !shape.isAuthentic) {
      setTightViewBox(null);
      return;
    }
    const box = el.getBBox();
    if (box.width <= 0 || box.height <= 0) {
      setTightViewBox(null);
      return;
    }
    const pad = Math.max(box.width, box.height) * 0.05;
    setTightViewBox(`${box.x - pad} ${box.y - pad} ${box.width + pad * 2} ${box.height + pad * 2}`);
  }, [shape]);
  const effectiveViewBox = tightViewBox ?? shape.viewBox ?? "0 0 100 100";
  // Every hardcoded size in this file was originally tuned against the schematic fallback's own
  // fixed "0 0 100 100" box. Authentic geometry's tight viewBox is a different, real, MEASURED
  // width per circuit (not a guessable constant - see the effect above) - uiScale rescales every
  // one of those tuned constants proportionally, so a size that looked right at width=100 still
  // looks right at whatever real width this circuit's own tight box turned out to be, instead of
  // one fixed multiplier that was only ever a guess for an assumed "typical" authentic width.
  const [vbX, vbY, vbW, vbH] = effectiveViewBox.split(" ").map(Number);
  const uiScale = (vbW || 100) / 100;

  const cars = useMemo(() => buildSimCars(results ?? [], tireStints ?? [], raceLaps ?? []), [results, tireStints, raceLaps]);
  const cumTime = useMemo(() => buildCumulativeTime(raceLaps ?? []), [raceLaps]);
  const hasSimulation = cars.length > 0;
  const totalLaps = useMemo(() => (raceLaps && raceLaps.length ? Math.max(...raceLaps.map((e) => e.lap)) : 0), [raceLaps]);
  const hasRealLapData = totalLaps > 0;
  const maxGapSpread = 0.3; // the whole field spans at most 30% of the loop's circumference
  const lapT = raceT * Math.max(totalLaps, 1);
  const currentLap = hasRealLapData ? Math.min(totalLaps, Math.max(1, Math.ceil(lapT))) : null;

  // Reduced motion adjusts state DURING RENDER (React's own documented pattern for "a prop
  // changed, react to it") rather than inside an effect body - calling setState synchronously at
  // the top of a useEffect is exactly the pattern React's own lint now rejects.
  const [prevReduceMotion, setPrevReduceMotion] = useState(reduceMotion);
  if (prevReduceMotion !== reduceMotion) {
    setPrevReduceMotion(reduceMotion);
    if (reduceMotion) {
      setDrawn(true);
      setRaceT(1);
      setPlaying(false);
    }
  }

  useEffect(() => {
    if (reduceMotion) return;
    const t = window.setTimeout(() => setDrawn(true), 60);
    return () => window.clearTimeout(t);
  }, [reduceMotion]);

  // Pause when the tab is hidden or the map has scrolled off-screen.
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

  // Advances raceT (grid -> finish) while playing.
  useEffect(() => {
    if (!animationActive) return;
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

  // The one place car positions are actually computed - inside a rAF callback, never during
  // render. Depends on `cars`/`shape`, NOT on `raceT` (read via the ref mirror instead).
  useEffect(() => {
    if (!animationActive) return;
    let raf: number;
    function step() {
      const circulationT = (performance.now() / 1000 / CIRCULATION_SECONDS) % 1;
      const t = raceTRef.current * Math.max(totalLaps, 1);
      setRenderCars(computeCarPositions(shape, pathRef.current, cars, t, totalLaps, circulationT, maxGapSpread));
      raf = requestAnimationFrame(step);
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [animationActive, shape, cars, totalLaps, maxGapSpread]);

  // The static case (paused, reduced motion, or a raceT change while paused - including a manual
  // timeline scrub) - recomputes once whenever anything relevant changes, deferred one frame via
  // rAF rather than called synchronously at the top of the effect.
  useEffect(() => {
    if (!drawn) return;
    const raf = requestAnimationFrame(() => {
      setRenderPits(computePitPositions(shape, pathRef.current, cars));
      if (!animationActive) {
        setRenderCars(computeCarPositions(shape, pathRef.current, cars, lapT, totalLaps, 0, maxGapSpread));
      }
    });
    return () => cancelAnimationFrame(raf);
  }, [drawn, cars, shape, lapT, totalLaps, animationActive, maxGapSpread]);

  function restart() {
    setRaceT(0);
    setPlaying(true);
  }
  function scrub(next: number) {
    setPlaying(false);
    setRaceT(Math.min(1, Math.max(0, next)));
  }
  function stepLap(delta: number) {
    if (!hasRealLapData) return;
    scrub(raceT + delta / totalLaps);
  }

  const activeDriver = selectedDriver ?? hoverDriver;
  const activeCar = activeDriver ? cars.find((c) => c.driver === activeDriver) : null;
  const activeRender = activeDriver ? renderCars.find((c) => c.driver === activeDriver) : null;
  // Gap/tyre readouts only mean anything against a real, known lap number - without real
  // per-lap data (currentLap null) there's no honest "which lap is this" to anchor them to.
  const activeGap = activeCar && currentLap ? gapToLeaderAt(activeCar.driver, currentLap, cumTime) : null;
  const activeCompound = activeCar && currentLap ? compoundAtLap(activeCar, currentLap) : null;

  return (
    <div ref={containerRef} className="flex flex-col gap-4">
      <div className="relative w-full overflow-hidden rounded-md border border-white/[0.07] bg-white/[0.015]" style={{ aspectRatio: "4 / 3" }}>
        <svg
          viewBox={effectiveViewBox}
          className="h-full w-full"
          role="img"
          aria-label={`${shape.isAuthentic ? "Circuit" : "Stylized"} layout of the circuit, ${turns} turns${raceLabel ? `, showing ${raceLabel}` : ""}`}
        >
          <path
            ref={pathRef}
            d={shape.path}
            fill="none"
            stroke="rgba(255,255,255,0.55)"
            strokeWidth={1.8 * uiScale}
            strokeLinecap="round"
            strokeLinejoin="round"
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
          <line
            x1={shape.startFinish.x}
            y1={shape.startFinish.y - 2.8 * uiScale}
            x2={shape.startFinish.x}
            y2={shape.startFinish.y + 2.8 * uiScale}
            stroke="var(--f1-red)"
            strokeWidth={1.1 * uiScale}
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

          {drawn && renderPits.map((p) => <circle key={p.key} cx={p.x} cy={p.y} r={0.6 * uiScale} fill="rgba(234,179,8,0.55)" />)}

          {drawn &&
            hasSimulation &&
            renderCars.map((c) => {
              const dimmed = activeDriver !== null && activeDriver !== c.driver;
              return (
                <circle
                  key={c.driver}
                  cx={c.x}
                  cy={c.y}
                  r={(c.finishRank <= 3 ? 1.7 : 1.3) * uiScale}
                  fill={teamColor(c.team)}
                  stroke={activeDriver === c.driver ? "white" : "rgba(0,0,0,0.5)"}
                  strokeWidth={(activeDriver === c.driver ? 0.6 : 0.3) * uiScale}
                  opacity={dimmed ? 0.25 : c.dnf && lapT > retiredAtLapT(cars.find((x) => x.driver === c.driver)!, totalLaps) ? 0.25 : 1}
                  className="cursor-pointer"
                  onMouseEnter={() => setHoverDriver(c.driver)}
                  onMouseLeave={() => setHoverDriver(null)}
                  onClick={() => setSelectedDriver((cur) => (cur === c.driver ? null : c.driver))}
                >
                  <title>{c.driver}</title>
                </circle>
              );
            })}

          {drawn && activeCar && activeRender && (
            <CarTooltip
              car={activeCar}
              render={activeRender}
              currentLap={currentLap}
              gap={activeGap}
              compound={activeCompound}
              uiScale={uiScale}
              vbX={vbX}
              vbY={vbY}
              vbW={vbW}
              vbH={vbH}
            />
          )}
        </svg>

        <span className="absolute bottom-2 left-2 rounded-full border border-white/[0.14] bg-black/50 px-2 py-0.5 text-[9px] font-medium text-neutral-400 backdrop-blur-sm">
          {hasSimulation ? (hasRealLapData ? "Position interpolated from real lap timing — not live telemetry" : "Simulated from grid, finish & pit data — not live telemetry") : shape.isAuthentic ? "Circuit layout" : "Stylized layout — schematic, not to scale"}
        </span>
      </div>

      {hasSimulation && !reduceMotion && (
        <div className="flex flex-col gap-2">
          <input
            type="range"
            min={0}
            max={1}
            step={0.001}
            value={raceT}
            onChange={(e) => scrub(Number(e.target.value))}
            aria-label={currentLap ? `Race progress, lap ${currentLap} of ${totalLaps}` : "Race progress"}
            className="h-1 w-full cursor-pointer appearance-none rounded-full bg-white/[0.1] accent-[var(--f1-red)]"
          />
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => stepLap(-1)}
                disabled={!hasRealLapData}
                aria-label="Previous lap"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-neutral-300 transition hover:border-white/25 hover:text-white disabled:opacity-30"
              >
                <StepIcon back />
              </button>
              <button
                type="button"
                onClick={() => (raceT >= 1 ? restart() : setPlaying((p) => !p))}
                aria-label={playing ? "Pause simulation" : "Play simulation"}
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-neutral-300 transition hover:border-white/25 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--f1-red)]"
              >
                {raceT >= 1 ? <RestartIcon /> : playing ? <PauseIcon /> : <PlayIcon />}
              </button>
              <button
                type="button"
                onClick={() => stepLap(1)}
                disabled={!hasRealLapData}
                aria-label="Next lap"
                className="flex h-7 w-7 items-center justify-center rounded-full border border-white/10 text-neutral-300 transition hover:border-white/25 hover:text-white disabled:opacity-30"
              >
                <StepIcon />
              </button>
              {currentLap && (
                <span className="ml-1 font-mono text-[11px] tabular-nums text-neutral-500">
                  Lap {currentLap} / {totalLaps}
                </span>
              )}
            </div>
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

      {hasSimulation && (
        <div className="flex flex-wrap gap-1" role="group" aria-label="Drivers">
          {cars.map((c) => (
            <button
              key={c.driver}
              type="button"
              onMouseEnter={() => setHoverDriver(c.driver)}
              onMouseLeave={() => setHoverDriver(null)}
              onClick={() => setSelectedDriver((cur) => (cur === c.driver ? null : c.driver))}
              aria-pressed={selectedDriver === c.driver}
              className={`flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium transition ${
                activeDriver === c.driver ? "border-white/25 bg-white/[0.08] text-white" : "border-white/[0.07] text-neutral-500 hover:text-neutral-300"
              }`}
            >
              <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full" style={{ background: teamColor(c.team) }} />
              {c.driver}
            </button>
          ))}
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
function StepIcon({ back }: { back?: boolean }) {
  return (
    <svg viewBox="0 0 16 16" className="h-3 w-3" fill="currentColor" aria-hidden style={back ? { transform: "scaleX(-1)" } : undefined}>
      <path d="M4 2.5v11l7-5.5z" />
      <rect x="11.5" y="2.5" width="1.5" height="11" />
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
