"use client";

import { useEffect, useId, useState } from "react";
import { useRichMotion } from "@/hooks/useRichMotion";
import { teamColor } from "@/lib/teamColors";

/** One tick every `ms`, for the miniatures' little loops (a pick being made, points ticking up). Desktop only (rich
 * motion); on a phone, or with reduced motion, each miniature stays on its settled frame. */
function useTick(ms: number): number {
  const reduce = !useRichMotion();
  const [tick, setTick] = useState(0);
  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setTick((t) => t + 1), ms);
    return () => window.clearInterval(id);
  }, [ms, reduce]);
  return tick;
}

/** A pick being made: the cursor moves down the drivers, one is chosen, then "Locked in". */
export function PredictMini({ drivers, anonymous = false }: { drivers: { driver: string; driverName: string; team: string }[]; anonymous?: boolean }) {
  const tick = useTick(1100);
  // Anonymous (the sign-in gate's preview): bars, not names - nothing there should read as real data.
  const list = anonymous || !drivers.length ? [0, 1, 2].map((i) => ({ driver: `p${i}`, driverName: "", team: "" })) : drivers;
  const step = tick % (list.length + 2);
  const chosen = Math.min(step, list.length - 1);
  const locked = step >= list.length;
  return (
    <div>
      <p className="text-caption text-secondary">Who wins?</p>
      <ul className="mt-2 space-y-1.5">
        {list.map((d, i) => (
          <li key={d.driver} className={`flex items-center gap-2 rounded-sm border px-2 py-1.5 text-body-sm transition-colors duration-base ${i === chosen ? "border-white/40 bg-white/[0.08] text-primary" : "border-subtle text-secondary"}`}>
            {d.team ? (
              <>
                <span className="h-3.5 w-0.5" style={{ background: teamColor(d.team) }} />
                <span className="font-semibold">{d.driver}</span>
                <span className="truncate">{d.driverName}</span>
              </>
            ) : (
              <span className="h-2 w-24 rounded-full bg-white/20" />
            )}
          </li>
        ))}
      </ul>
      <p className={`mt-2 text-caption transition-opacity duration-base ${locked ? "text-success opacity-100" : "opacity-0"}`}>✓ Locked in</p>
    </div>
  );
}

const MINI_TRACK = "M20 70 C20 30 60 18 100 22 C140 26 170 18 186 40 C200 60 180 78 150 80 C120 82 110 100 80 104 C50 108 20 100 20 70 Z";

/** Cars lapping a circuit, as the race replay draws them, beside a running order. */
export function ReplayMini({ drivers, anonymous = false }: { drivers: { driver: string; team: string }[]; anonymous?: boolean }) {
  const trackId = `mini-track-${useId().replace(/:/g, "")}`;
  const cars = (drivers.length ? drivers : [{ driver: "VER", team: "Red Bull Racing" }]).slice(0, 4);
  const colorOf = (c: { team: string }, i: number) => (anonymous ? ["#e10600", "#27f4d2", "#ff8000", "#3671c6"][i % 4] : teamColor(c.team));
  // Still positions along the track, for the calm (phone) version: the leader ahead, the rest behind.
  const STILL = [[152, 24], [100, 22], [45, 29.5], [20, 70]];
  return (
    <div className={`grid items-center gap-3 ${anonymous ? "grid-cols-1" : "grid-cols-[1.4fr_1fr]"}`}>
      <svg viewBox="0 0 206 124" className="w-full">
        <path id={trackId} d={MINI_TRACK} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth={10} strokeLinejoin="round" />
        <path d={MINI_TRACK} fill="none" stroke="rgb(255 255 255 / 0.55)" strokeWidth={1.6} strokeLinejoin="round" />
        {/* Both versions from the first byte; CSS shows one (globals.css .rich-only / .calm-only). */}
        <g className="rich-only">
          {cars.map((c, i) => (
            <circle key={c.driver} r={4} fill={colorOf(c, i)} stroke="rgb(0 0 0 / 0.6)" strokeWidth={1}>
              <animateMotion dur={`${7 + i * 0.35}s`} begin={`-${i * 0.5}s`} repeatCount="indefinite">
                <mpath href={`#${trackId}`} />
              </animateMotion>
            </circle>
          ))}
        </g>
        <g className="calm-only">
          {cars.map((c, i) => (
            <circle key={c.driver} cx={STILL[i % 4][0]} cy={STILL[i % 4][1]} r={4} fill={colorOf(c, i)} stroke="rgb(0 0 0 / 0.6)" strokeWidth={1} />
          ))}
        </g>
      </svg>
      {!anonymous && <ol className="space-y-1 text-caption">
        {cars.map((c, i) => (
          <li key={c.driver} className="flex items-center gap-1.5">
            <span className="w-3 tabular text-tertiary">{i + 1}</span>
            <span className="h-3 w-0.5" style={{ background: teamColor(c.team) }} />
            <span className="font-semibold text-primary">{c.driver}</span>
            <span className="ml-auto tabular text-tertiary">{i === 0 ? "Leader" : `+${(i * 1.4).toFixed(1)}s`}</span>
          </li>
        ))}
      </ol>}
    </div>
  );
}

/** Apex answering a question, typed out, then the next one. */
export function ApexMini({ leader }: { leader: string | null }) {
  const tick = useTick(5200);
  const lines = [
    { q: "Who is leading the title race?", a: leader ? `${leader} leads, with the gap built on qualifying pace.` : "The championship leader, and how the gap was built." },
    { q: "Where was the race won?", a: "At the start, into the first corner, then held through the stops." },
    { q: "Does pole matter here?", a: "More than most: overtaking is hard, so qualifying sets up the race." },
  ];
  const { q, a } = lines[tick % lines.length];
  return (
    <div className="space-y-2" key={tick}>
      <p className="ml-auto w-fit max-w-[85%] rounded-control bg-white/[0.08] px-2.5 py-1.5 text-body-sm text-primary">{q}</p>
      <p className="max-w-[92%] rounded-control border border-subtle px-2.5 py-1.5 text-body-sm text-secondary">
        <TypeOut text={a} />
      </p>
    </div>
  );
}

function TypeOut({ text }: { text: string }) {
  const reduce = !useRichMotion();
  const [n, setN] = useState(reduce ? text.length : 0);
  useEffect(() => {
    if (reduce) return;
    const id = window.setInterval(() => setN((k) => (k >= text.length ? k : k + 1)), 28);
    return () => window.clearInterval(id);
  }, [text, reduce]);
  return (
    <>
      {text.slice(0, n)}
      {n < text.length && <span className="ml-0.5 inline-block h-3.5 w-1 translate-y-0.5 animate-pulse bg-secondary" />}
    </>
  );
}

/** A circuit with a car lapping it, as the circuit pages draw them. */
export function CircuitMini() {
  const circuitId = `mini-circuit-${useId().replace(/:/g, "")}`;
  const path = "M30 20 L120 20 C140 20 150 32 146 50 L138 84 C134 100 120 104 106 96 L80 80 C70 74 58 76 52 88 L46 100 C40 112 24 110 22 96 L18 40 C17 28 22 20 30 20 Z";
  return (
    <svg viewBox="0 0 166 124" className="w-full">
      <path id={circuitId} d={path} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth={10} strokeLinejoin="round" />
      <path d={path} fill="none" stroke="rgb(255 255 255 / 0.55)" strokeWidth={1.6} strokeLinejoin="round" />
      <g className="rich-only">
        <path d={path} pathLength={100} fill="none" stroke="#e10600" strokeOpacity={0.5} strokeWidth={3} strokeLinecap="round" strokeDasharray="12 88">
          <animate attributeName="stroke-dashoffset" from={12} to={-88} dur="6s" repeatCount="indefinite" />
        </path>
        <circle r={3.5} fill="#e10600">
          <animateMotion dur="6s" repeatCount="indefinite">
            <mpath href={`#${circuitId}`} />
          </animateMotion>
        </circle>
      </g>
      <circle className="calm-only" cx={30} cy={20} r={3.5} fill="#e10600" />
    </svg>
  );
}

/** Seasons across the decades, rising in. */
export function ArchiveMini() {
  const heights = [30, 42, 38, 55, 48, 70, 62, 80, 58, 74, 90, 66];
  return (
    <div>
      <div className="flex h-20 items-end gap-1">
        {heights.map((h, i) => (
          <span key={i} className="mini-bar flex-1 rounded-t-sm bg-white/40" style={{ height: `${h}%`, ["--bar-delay" as string]: `${i * 0.12}s` }} />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-caption tabular text-tertiary">
        <span>1950</span>
        <span>1990</span>
        <span>2025</span>
      </div>
    </div>
  );
}
