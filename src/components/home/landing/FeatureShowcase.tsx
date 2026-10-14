"use client";

import { useEffect, useState } from "react";
import { useAuthDialogStore } from "@/store/useAuthDialogStore";
import { useReducedMotion } from "framer-motion";
import { Archive, Bot, Flag, MapPin, Trophy, Users } from "lucide-react";
import { MiniWindow } from "./MiniWindow";
import { teamColor } from "@/lib/teamColors";
import type { LandingData } from "@/lib/homeData";

type Feature = "predict" | "replay" | "apex" | "season" | "circuits" | "archive";

/** One tick every `ms`, for the miniatures' little loops (a pick being made, points ticking up). Stops under reduced
 * motion, leaving each miniature on its settled frame. */
function useTick(ms: number): number {
  const reduce = useReducedMotion();
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
  const top = landing.season?.ticker?.slice(0, 5) ?? landing.season?.top5 ?? [];
  const raceName = landing.nextRace?.name ?? "the next Grand Prix";

  return (
    <section aria-labelledby="showcase-heading" className="grid grid-cols-1 items-center gap-10 lg:grid-cols-[minmax(0,0.85fr)_minmax(0,1.15fr)] lg:gap-14">
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
          <button type="button" onClick={openAuth} className="rounded-control bg-brand px-5 py-2.5 text-body font-semibold text-white transition-colors hover:bg-brand/90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring">
            Create a free account
          </button>
          <button type="button" onClick={openAuth} className="text-body font-medium text-secondary underline-offset-4 hover:text-primary hover:underline">
            Sign in
          </button>
        </div>
      </div>

      {/* The floating windows. Absolutely placed on a stage from lg; a two-column grid below that. */}
      <div aria-hidden className="relative grid min-w-0 grid-cols-1 gap-4 sm:grid-cols-2 lg:block lg:h-[620px]">
        <MiniWindow title={`Predict · ${raceName}`} active={active === "predict"} className="lg:absolute lg:left-0 lg:top-4 lg:z-20 lg:w-64" float={{ x: 3, y: 10, dur: 8, delay: 0 }}>
          <PredictMini drivers={top.slice(0, 3)} />
        </MiniWindow>
        <MiniWindow title="Race replay" active={active === "replay"} className="lg:absolute lg:right-2 lg:top-0 lg:z-10 lg:w-80" float={{ x: 5, y: 14, dur: 10, delay: 2 }}>
          <ReplayMini drivers={top.slice(0, 4)} />
        </MiniWindow>
        <MiniWindow title="Apex" active={active === "apex"} className="lg:absolute lg:left-24 lg:top-[248px] lg:z-30 lg:w-72" float={{ x: 4, y: 12, dur: 9, delay: 4 }}>
          <ApexMini leader={top[0]?.driverName ?? null} />
        </MiniWindow>
        <MiniWindow title={`${landing.year} championship`} active={active === "season"} className="lg:absolute lg:right-0 lg:top-[268px] lg:z-20 lg:w-64" float={{ x: 3, y: 16, dur: 11, delay: 1 }}>
          <SeasonMini drivers={top} />
        </MiniWindow>
        <MiniWindow title="Circuits" active={active === "circuits"} className="lg:absolute lg:bottom-6 lg:left-0 lg:z-10 lg:w-56" float={{ x: 4, y: 11, dur: 9.5, delay: 3 }}>
          <CircuitMini />
        </MiniWindow>
        <MiniWindow title="Archive · since 1950" active={active === "archive"} className="lg:absolute lg:bottom-0 lg:left-[46%] lg:z-20 lg:w-60" float={{ x: 5, y: 13, dur: 10.5, delay: 5 }}>
          <ArchiveMini />
        </MiniWindow>
      </div>
    </section>
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
  const reduce = useReducedMotion();
  const cars = (drivers.length ? drivers : [{ driver: "VER", team: "Red Bull Racing" }]).slice(0, 4);
  return (
    <div className={`grid items-center gap-3 ${anonymous ? "grid-cols-1" : "grid-cols-[1.4fr_1fr]"}`}>
      <svg viewBox="0 0 206 124" className="w-full">
        <path id="mini-track" d={MINI_TRACK} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth={10} strokeLinejoin="round" />
        <path d={MINI_TRACK} fill="none" stroke="rgb(255 255 255 / 0.55)" strokeWidth={1.6} strokeLinejoin="round" />
        {cars.map((c, i) => (
          <circle key={c.driver} r={4} fill={anonymous ? ["#e10600", "#27f4d2", "#ff8000", "#3671c6"][i % 4] : teamColor(c.team)} stroke="rgb(0 0 0 / 0.6)" strokeWidth={1}>
            {!reduce && (
              <animateMotion dur={`${7 + i * 0.35}s`} begin={`-${i * 0.5}s`} repeatCount="indefinite">
                <mpath href="#mini-track" />
              </animateMotion>
            )}
          </circle>
        ))}
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
  const reduce = useReducedMotion();
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
  const reduce = useReducedMotion();
  const path = "M30 20 L120 20 C140 20 150 32 146 50 L138 84 C134 100 120 104 106 96 L80 80 C70 74 58 76 52 88 L46 100 C40 112 24 110 22 96 L18 40 C17 28 22 20 30 20 Z";
  return (
    <svg viewBox="0 0 166 124" className="w-full">
      <path id="mini-circuit" d={path} fill="none" stroke="rgb(255 255 255 / 0.07)" strokeWidth={10} strokeLinejoin="round" />
      <path d={path} fill="none" stroke="rgb(255 255 255 / 0.55)" strokeWidth={1.6} strokeLinejoin="round" />
      {!reduce && (
        <>
          <path d={path} pathLength={100} fill="none" stroke="#e10600" strokeOpacity={0.5} strokeWidth={3} strokeLinecap="round" strokeDasharray="12 88">
            <animate attributeName="stroke-dashoffset" from={12} to={-88} dur="6s" repeatCount="indefinite" />
          </path>
          <circle r={3.5} fill="#e10600">
            <animateMotion dur="6s" repeatCount="indefinite">
              <mpath href="#mini-circuit" />
            </animateMotion>
          </circle>
        </>
      )}
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
