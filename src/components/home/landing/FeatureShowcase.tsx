"use client";

import { useEffect, useId, useState, type PointerEvent, type ReactNode } from "react";
import { useAuthDialogStore } from "@/store/useAuthDialogStore";
import { Button } from "@/components/ui/Button";
import { motion, useMotionValue, useSpring, useTransform, type MotionValue } from "framer-motion";
import { useRichMotion } from "@/hooks/useRichMotion";
import { Archive, Bot, Flag, MapPin, Trophy, Users } from "lucide-react";
import { MiniWindow } from "./MiniWindow";
import { teamColor } from "@/lib/teamColors";
import type { LandingData } from "@/lib/homeData";

type Feature = "predict" | "replay" | "apex" | "season" | "circuits" | "archive";

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

const FEATURES: { key: Feature; icon: typeof Flag; title: string; text: string }[] = [
  { key: "predict", icon: Trophy, title: "Predict every race", text: "Pick the winner, the podium and more before each Grand Prix, and score points against everyone else - and against our model." },
  { key: "replay", icon: Flag, title: "Relive the race", text: "Every car on the real circuit, lights out to the flag, with every lead change and where on the track it happened." },
  { key: "apex", icon: Bot, title: "Ask Apex", text: "Our AI analyst reads the real results and timing, and explains a race, a season or a circuit in plain words." },
  { key: "season", icon: Users, title: "Follow the championship", text: "Standings with sprint points, form, head-to-heads and how the title fight moved round by round." },
  { key: "circuits", icon: MapPin, title: "Know every circuit", text: "Each track as it is raced today, how its layout changed through the years, and who wins there." },
  { key: "archive", icon: Archive, title: "Every race since 1950", text: "Seasons, drivers, teams and circuits across 76 years of official classifications." },
];

/**
 * "What you can do here", for a visitor who isn't signed in: the features in a list on the left, and on the right a
 * cluster of small floating app windows, each a live miniature of that feature - a pick being locked in, cars lapping
 * a circuit, Apex typing an answer, the standings growing in. Pointing at a feature lifts its window. Real data where
 * the landing page already has it (the next race, this season's top drivers and their points). On a phone the windows
 * sit in a grid instead of floating.
 */
export function FeatureShowcase({ landing }: { landing: LandingData }) {
  const [active, setActive] = useState<Feature | null>(null);
  const openAuth = useAuthDialogStore((s) => s.open);
  const rich = useRichMotion();
  // The pointer over the stage, -1..1 each way, eased by a spring; the stage tilts and each window shifts by its depth.
  const px = useMotionValue(0);
  const py = useMotionValue(0);
  const sx = useSpring(px, { stiffness: 80, damping: 18, mass: 0.6 });
  const sy = useSpring(py, { stiffness: 80, damping: 18, mass: 0.6 });
  const rotateY = useTransform(sx, (v) => v * 5);
  const rotateX = useTransform(sy, (v) => v * -4);
  // Whether the windows fly in: only if the stage is below the fold when the page arrives (otherwise they're already
  // being looked at, and hiding them to animate them in would be the flicker).
  const [stageEl, setStageEl] = useState<HTMLDivElement | null>(null);
  const [enter, setEnter] = useState<boolean | null>(null);
  useEffect(() => {
    if (!rich || !stageEl || enter !== null) return;
    const t = window.setTimeout(() => setEnter(stageEl.getBoundingClientRect().top > window.innerHeight * 0.85), 0);
    return () => window.clearTimeout(t);
  }, [rich, stageEl, enter]);
  const onMove = (e: PointerEvent<HTMLDivElement>) => {
    const r = e.currentTarget.getBoundingClientRect();
    px.set(((e.clientX - r.left) / r.width) * 2 - 1);
    py.set(((e.clientY - r.top) / r.height) * 2 - 1);
  };
  const top = landing.season?.ticker?.slice(0, 5) ?? landing.season?.top5 ?? [];
  const raceName = landing.nextRace?.name ?? "the next Grand Prix";

  return (
    <section aria-labelledby="showcase-heading" className="isolate grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
      <div className="min-w-0">
        <p className="text-body-sm text-secondary">What is F1 Hub?</p>
        <h2 id="showcase-heading" className="mt-1 text-display-md font-semibold text-primary">
          Everything about the Formula 1 season, in one place.
        </h2>
        <p className="mt-3 max-w-xl text-body text-secondary">
          Live results and timing, predictions you can play with friends, an AI analyst, and every race since 1950. Free, and
          built for anyone who follows the sport.
        </p>
        <ul className="mt-8 space-y-1" onMouseLeave={() => setActive(null)}>
          {FEATURES.map((f) => (
            <li key={f.key}>
              <button
                type="button"
                onMouseEnter={() => setActive(f.key)}
                onFocus={() => setActive(f.key)}
                onBlur={() => setActive(null)}
                className={`flex w-full items-start gap-4 rounded-control px-3 py-3 text-left transition-colors duration-fast ${active === f.key ? "bg-white/[0.06]" : "hover:bg-white/[0.04]"}`}
              >
                <f.icon aria-hidden size={20} className={`mt-0.5 shrink-0 ${active === f.key ? "text-brand-text" : "text-secondary"}`} />
                <span className="min-w-0">
                  <span className="block text-body font-semibold text-primary">{f.title}</span>
                  <span className="mt-0.5 block text-body-sm text-secondary">{f.text}</span>
                </span>
              </button>
            </li>
          ))}
        </ul>
        <div className="mt-8 flex flex-wrap items-center gap-4">
          <Button variant="primary" size="md" onClick={openAuth}>
            Create a free account
          </Button>
          <Button variant="ghost" size="md" onClick={openAuth}>
            Sign in
          </Button>
        </div>
      </div>

      {/* The floating windows. On desktop: absolutely placed on a stage that tilts with the pointer, each window its
          own layer. On a phone or tablet: a calm two-column grid. */}
      <motion.div
        ref={setStageEl}
        aria-hidden
        onPointerMove={rich ? onMove : undefined}
        onPointerLeave={rich ? () => { px.set(0); py.set(0); } : undefined}
        style={rich ? { rotateX, rotateY, transformPerspective: 1400 } : undefined}
        className="relative grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:block lg:h-[620px]"
      >
        <Layer px={sx} py={sy} depth={0.9} order={0} rich={rich} enter={enter} className="lg:absolute lg:left-0 lg:top-4 lg:z-20 lg:w-64">
          <MiniWindow title={`Predict · ${raceName}`} active={active === "predict"} float={{ x: 3, y: 10, dur: 8, delay: 0 }}>
            <PredictMini drivers={top.slice(0, 3)} />
          </MiniWindow>
        </Layer>
        <Layer px={sx} py={sy} depth={0.5} order={1} rich={rich} enter={enter} className="lg:absolute lg:right-2 lg:top-0 lg:z-10 lg:w-80">
          <MiniWindow title="Race replay" active={active === "replay"} float={{ x: 5, y: 14, dur: 10, delay: 2 }}>
            <ReplayMini drivers={top.slice(0, 4)} />
          </MiniWindow>
        </Layer>
        <Layer px={sx} py={sy} depth={1.2} order={2} rich={rich} enter={enter} className="lg:absolute lg:left-24 lg:top-[248px] lg:z-30 lg:w-72">
          <MiniWindow title="Apex" active={active === "apex"} float={{ x: 4, y: 12, dur: 9, delay: 4 }}>
            <ApexMini leader={top[0]?.driverName ?? null} />
          </MiniWindow>
        </Layer>
        <Layer px={sx} py={sy} depth={0.8} order={3} rich={rich} enter={enter} className="lg:absolute lg:right-0 lg:top-[268px] lg:z-20 lg:w-64">
          <MiniWindow title={`${landing.year} championship`} active={active === "season"} float={{ x: 3, y: 16, dur: 11, delay: 1 }}>
            <SeasonMini drivers={top} />
          </MiniWindow>
        </Layer>
        <Layer px={sx} py={sy} depth={0.4} order={4} rich={rich} enter={enter} className="lg:absolute lg:bottom-6 lg:left-0 lg:z-10 lg:w-56">
          <MiniWindow title="Circuits" active={active === "circuits"} float={{ x: 4, y: 11, dur: 9.5, delay: 3 }}>
            <CircuitMini />
          </MiniWindow>
        </Layer>
        <Layer px={sx} py={sy} depth={1} order={5} rich={rich} enter={enter} className="lg:absolute lg:bottom-0 lg:left-[46%] lg:z-20 lg:w-60">
          <MiniWindow title="Archive · since 1950" active={active === "archive"} float={{ x: 5, y: 13, dur: 10.5, delay: 5 }}>
            <ArchiveMini />
          </MiniWindow>
        </Layer>
      </motion.div>
    </section>
  );
}

/** A window on the desktop stage: flies in (staggered by `order`) when the stage comes into view, then drifts with the
 * pointer - nearer windows (`depth` higher) move more, so the cluster reads as layers in space. Phones: a plain block. */
function Layer({ px, py, depth, order, rich, enter, className, children }: { px: MotionValue<number>; py: MotionValue<number>; depth: number; order: number; rich: boolean; enter: boolean | null; className: string; children: ReactNode }) {
  const x = useTransform(px, (v) => v * depth * 26);
  const y = useTransform(py, (v) => v * depth * 18);
  // `enter` is decided once, after the page is in the browser: fly in only if the stage was still off screen then.
  // Until it's decided - and on a phone - a plain block, exactly as the server sent it, so nothing blinks.
  if (!rich || enter === null) return <div className={className}>{children}</div>;
  return (
    <motion.div
      className={className}
      style={{ x, y }}
      initial={enter ? { opacity: 0, y: 46, scale: 0.9, filter: "blur(6px)" } : false}
      whileInView={{ opacity: 1, scale: 1, filter: "blur(0px)" }}
      viewport={{ once: true, amount: 0.25 }}
      transition={{ duration: 0.75, delay: 0.12 * order, ease: [0.2, 0, 0, 1] }}
    >
      {children}
    </motion.div>
  );
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

/** The standings, bars growing in. */
export function SeasonMini({ drivers }: { drivers: { driver: string; team: string; points: number }[] }) {
  const max = Math.max(...drivers.map((d) => d.points), 1);
  return (
    <div className="space-y-1.5">
      {drivers.slice(0, 5).map((d, i) => (
        <div key={d.driver} className="grid grid-cols-[2.5rem_1fr_2.5rem] items-center gap-2 text-caption">
          <span className="font-semibold text-primary">{d.driver}</span>
          <span className="h-2 overflow-hidden rounded-full bg-white/[0.06]">
            <span className="mini-bar-x block h-full rounded-full" style={{ width: `${(d.points / max) * 100}%`, background: teamColor(d.team), ["--bar-delay" as string]: `${i * 0.15}s` }} />
          </span>
          <span className="text-right tabular text-secondary">{d.points}</span>
        </div>
      ))}
    </div>
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
