"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { useReducedMotion } from "motion/react";
import { Pause, Play } from "lucide-react";
import { lapAt, leadChanges, standingsAt, statusAt, type Replay } from "@/lib/raceReplay";
import { projectTrack, smoothClosedPath, TRACK_STORY_VERSION, type RaceTrackStory } from "@/lib/raceTrackStory";

// Fast by default: at 60x an 88-minute race plays in under a minute and a half. Slower speeds for a close look.
const SPEEDS = [10, 30, 60, 120];
const STATUS_LABEL: Record<string, string | null> = { clear: null, yellow: "Yellow flag", sc: "Safety car", vsc: "Virtual safety car", vsc_ending: "VSC ending", red: "Red flag" };

function clock(s: number): string {
  const m = Math.floor(s / 60);
  return `${m}:${String(Math.floor(s % 60)).padStart(2, "0")}`;
}

/**
 * The race, replayed on its own traced circuit: a dot per car in its team colour, moving as the car did, with the
 * running order beside it. Play, pause, speed (1x-60x) and a timeline; space and the arrow keys work on the focused
 * player. Positions are interpolated between the replay's two samples a second. A car in the pits is drawn faded
 * beside the track (the pit lane's own line isn't traced); a retired car disappears.
 */
export function RaceReplay({ replay, autoPlay = false }: { replay: Replay; autoPlay?: boolean }) {
  const { header } = replay;
  const reduceMotion = useReducedMotion();
  const [t, setT] = useState(0);
  // Starts playing when it was opened by pressing Play - unless the visitor prefers reduced motion.
  const [playing, setPlaying] = useState(() => autoPlay && !(typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches));
  const [speed, setSpeed] = useState(10);
  const last = useRef<number | null>(null);

  const track: RaceTrackStory = useMemo(
    () => ({ version: TRACK_STORY_VERSION, lapLengthM: header.lapLengthM, outline: header.outline, startFinish: header.startFinish, rotation: header.rotation, corners: header.corners, leadChanges: [] }),
    [header],
  );
  const proj = useMemo(() => projectTrack(track), [track]);
  const path = useMemo(() => smoothClosedPath(proj.points), [proj]);
  const [, , vbW] = proj.viewBox.split(" ").map(Number);
  const unit = vbW / 700;

  // Arc length along the projected outline, so "metres into the lap" maps to a point on the drawing.
  const arc = useMemo(() => {
    const pts = proj.points;
    const cum = [0];
    for (let i = 1; i <= pts.length; i++) {
      const [a, b] = [pts[i - 1], pts[i % pts.length]];
      cum.push(cum[i - 1] + Math.hypot(b[0] - a[0], b[1] - a[1]));
    }
    return { pts, cum, total: cum[cum.length - 1] };
  }, [proj]);
  const pointAt = useCallback(
    (metres: number): [number, number] => {
      const L = header.lapLengthM;
      const target = ((((metres % L) + L) % L) / L) * arc.total;
      let lo = 0;
      let hi = arc.cum.length - 1;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if (arc.cum[mid] <= target) lo = mid;
        else hi = mid;
      }
      const a = arc.pts[lo % arc.pts.length];
      const b = arc.pts[hi % arc.pts.length];
      const f = (target - arc.cum[lo]) / Math.max(1e-9, arc.cum[hi] - arc.cum[lo]);
      return [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f];
    },
    [arc, header.lapLengthM],
  );

  // The clock: advances `speed` race seconds per real second while playing.
  useEffect(() => {
    if (!playing) {
      last.current = null;
      return;
    }
    let raf = 0;
    const tick = (now: number) => {
      if (last.current !== null) {
        const dt = (now - last.current) / 1000;
        setT((prev) => {
          const next = prev + dt * speed * header.hz;
          if (next >= header.samples - 1) {
            setPlaying(false);
            return header.samples - 1;
          }
          return next;
        });
      }
      last.current = now;
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing, speed, header.hz, header.samples]);

  const standings = useMemo(() => standingsAt(replay, t), [replay, t]);
  const status = statusAt(header, t);
  const lap = lapAt(replay, t);
  const carsByCode = useMemo(() => new Map(header.cars.map((c) => [c.code, c])), [header.cars]);
  const elapsed = t / header.hz;
  const moments = useMemo(() => leadChanges(replay), [replay]);

  function onKey(e: KeyboardEvent) {
    if (e.key === " ") setPlaying((p) => !p);
    else if (e.key === "ArrowRight") setT((x) => Math.min(header.samples - 1, x + 10 * header.hz));
    else if (e.key === "ArrowLeft") setT((x) => Math.max(0, x - 10 * header.hz));
    else return;
    e.preventDefault();
  }

  return (
    <section aria-label="Race replay" className="rounded-control focus-visible:outline-1 focus-visible:outline-offset-4 focus-visible:outline-white/25" tabIndex={0} onKeyDown={onKey}>
      <div className="flex flex-wrap items-baseline justify-end gap-x-4 gap-y-1">
        <p className="text-caption tabular text-tertiary" aria-live="off">
          Lap {lap}
          {header.totalLaps ? `/${header.totalLaps}` : ""} · {clock(elapsed)}
        </p>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_14rem]">
        <div className="relative">
          {STATUS_LABEL[status] && (
            <p
              className={`absolute left-0 top-0 z-10 rounded-control px-2 py-1 text-caption font-semibold ${status === "red" ? "bg-brand text-white" : "text-black"}`}
              style={status === "red" ? undefined : { background: "var(--f1-yellow, #f5c400)" }}
              role="status"
            >
              {STATUS_LABEL[status]}
            </p>
          )}
          <svg viewBox={proj.viewBox} className="mx-auto block h-auto max-h-[26rem] w-full" role="img" aria-label="The race replayed on its own circuit: a dot per car">
            <path d={path} fill="none" stroke="rgb(255 255 255 / 0.06)" strokeWidth={14} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            <path d={path} fill="none" stroke="rgb(255 255 255 / 0.4)" strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
            {[...standings].reverse().map((s) => {
              if (s.retired) return null;
              const car = carsByCode.get(s.code);
              const [x, y] = pointAt(s.distance);
              const leader = s.code === standings[0]?.code;
              return (
                <g key={s.code} opacity={s.pit ? 0.35 : 1}>
                  <circle cx={x} cy={y} r={(leader ? 7 : 5.5) * unit} fill={car?.color ?? "#ccc"} stroke="rgb(10 10 12)" strokeWidth={1.5} vectorEffect="non-scaling-stroke" />
                  {leader && (
                    <text x={x} y={y - 12 * unit} fontSize={10 * unit} fill="white" textAnchor="middle" fontWeight={600}>
                      {s.code}
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
        </div>

        <ol className="grid grid-cols-2 gap-x-3 gap-y-0.5 text-caption tabular lg:grid-cols-1" aria-label="Running order">
          {standings.map((s, i) => {
            const car = carsByCode.get(s.code);
            return (
              <li key={s.code} className={`flex items-center gap-2 ${s.retired ? "text-tertiary line-through" : "text-secondary"}`}>
                <span className="w-5 text-right text-tertiary">{i + 1}</span>
                <span aria-hidden className="h-3 w-0.5 rounded-full" style={{ background: car?.color ?? "#ccc" }} />
                <span className="w-9 font-semibold text-primary">{s.code}</span>
                <span className="ml-auto text-tertiary">{s.retired ? "OUT" : s.pit ? "PIT" : i === 0 ? "Leader" : s.gapS !== null ? `+${s.gapS.toFixed(1)}s` : ""}</span>
              </li>
            );
          })}
        </ol>
      </div>

      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          type="button"
          onClick={() => setPlaying((p) => !p)}
          aria-label={playing ? "Pause" : "Play"}
          className="flex size-9 items-center justify-center rounded-control border border-subtle text-primary transition-colors hover:bg-white/[0.06]"
        >
          {playing ? <Pause aria-hidden size={16} /> : <Play aria-hidden size={16} />}
        </button>
        <input
          type="range"
          min={0}
          max={header.samples - 1}
          step={1}
          value={Math.round(t)}
          onChange={(e) => setT(Number(e.target.value))}
          aria-label="Race time"
          aria-valuetext={`Lap ${lap}, ${clock(elapsed)} into the race`}
          className="min-w-40 flex-1"
          style={{ accentColor: "var(--color-brand)" }}
        />
        <div className="flex gap-1" role="group" aria-label="Speed">
          {SPEEDS.map((s) => (
            <button
              key={s}
              type="button"
              aria-pressed={speed === s}
              onClick={() => setSpeed(s)}
              className={`rounded-control border px-2 py-1 text-caption tabular ${speed === s ? "border-white/40 bg-white/[0.06] text-primary" : "border-subtle text-secondary hover:text-primary"}`}
            >
              {s}×
            </button>
          ))}
        </div>
      </div>
      {moments.length > 0 && (
        // Straight to the action: each change of the lead, a few seconds before it happens.
        <div className="mt-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Jump to a lead change">
          <span className="text-caption text-tertiary">Lead changes</span>
          {moments.map((m) => (
            <button
              key={m.sample}
              type="button"
              onClick={() => {
                setT(Math.max(0, m.sample - 8 * header.hz));
                setPlaying(true);
              }}
              className="rounded-control border border-subtle px-2 py-1 text-caption tabular text-secondary transition-colors hover:text-primary"
            >
              L{m.lap} · {m.code}
            </button>
          ))}
        </div>
      )}
      {header.approximate && (
        <p className="mt-3 text-caption text-tertiary">
          Approximated from lap times: F1&apos;s position data for this race is incomplete. The order is exact at every lap line; between laps cars are shown at an even pace.
        </p>
      )}
      {reduceMotion && <p className="mt-2 text-caption text-tertiary">Reduced motion is on: the replay doesn&apos;t start by itself.</p>}
    </section>
  );
}
