"use client";

import { useRef, type ReactNode, type RefObject } from "react";
import { motion, useMotionValue, useReducedMotion, useScroll, useTransform, type MotionValue } from "motion/react";
import { outlookHeadline } from "@/components/race/ModelOutlook";
import { Button } from "@/components/ui/Button";
import { DriverIdentity } from "@/components/ui/DriverIdentity";
import { ProbabilityMeter } from "@/components/ui/ProbabilityMeter";
import { ProvenanceLine } from "@/components/ui/ProvenanceLine";
import type { LandingData } from "@/lib/homeData";
import { teamColor } from "@/lib/teamColors";
import { useAuthDialogStore } from "@/store/useAuthDialogStore";
import { LandingArchiveSection } from "./LandingSections";

/** Chapters 2 to 5 and the finale: loaded as their own chunk below the first screen (LandingStory). */
export function StoryChapters({ landing }: { landing: LandingData }) {
  return (
    <>
      <TheGrid landing={landing} />
      <Strategy landing={landing} />
      <ThePodium landing={landing} />
      <TheArchive landing={landing} />
      <YourTurn landing={landing} />
    </>
  );
}

/** How far the reader has scrolled through a pinned chapter, 0 to 1; held at 1 with reduced motion, so every
 * scroll-linked picture is shown finished. */
function useChapterProgress(ref: RefObject<HTMLElement | null>): { progress: MotionValue<number>; reduced: boolean } {
  const reduced = !!useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end end"] });
  const done = useMotionValue(1);
  return { progress: reduced ? done : scrollYProgress, reduced };
}

/** A chapter: a tall track whose content stays pinned (CSS sticky) while the reader scrolls through it. With reduced
 * motion it is an ordinary section, as tall as its content. */
function Chapter({
  id,
  number,
  label,
  title,
  sectionRef,
  pinnedHeight,
  reduced,
  children,
}: {
  id: string;
  number: number;
  label: string;
  title: ReactNode;
  sectionRef: RefObject<HTMLElement | null>;
  /** The scroll track's height while pinned, in svh. */
  pinnedHeight: number;
  reduced: boolean;
  children: ReactNode;
}) {
  return (
    <section ref={sectionRef} aria-labelledby={id} className="relative" style={reduced ? undefined : { height: `${pinnedHeight}svh` }}>
      <div className={reduced ? "page-content py-16" : "page-content sticky top-0 flex min-h-[100svh] flex-col justify-center py-16"}>
        <p className="text-body-sm text-secondary">
          Chapter {number} · {label}
        </p>
        <h2 id={id} className="story-statement mt-3">
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}

type GridRow = { driver: string; driverName: string; team: string; detail: string };

/** Chapter 2: the grid as qualifying set it, or, before qualifying, the championship order; one row per scroll step. */
function TheGrid({ landing }: { landing: LandingData }) {
  const ref = useRef<HTMLElement>(null);
  const { progress, reduced } = useChapterProgress(ref);
  const race = landing.nextRace;
  const grid = (race?.inputs ?? []).filter((i) => i.grid > 0).sort((a, b) => a.grid - b.grid);
  const season = landing.season;
  let rows: GridRow[];
  let title: string;
  let caption: string;
  if (race && grid.length > 0) {
    rows = grid.slice(0, 10).map((i) => ({ driver: i.driver, driverName: i.driverName, team: i.team, detail: i.qualifyingGapSec ? `+${i.qualifyingGapSec.toFixed(3)}s` : "Pole" }));
    title = `${grid[0].driverName} on pole`;
    caption = `${race.name}, the top ten after qualifying`;
  } else if (season?.ticker?.length || season?.top5.length) {
    rows = (season.ticker ?? season.top5).slice(0, 10).map((s) => ({ driver: s.driver, driverName: s.driverName, team: s.team, detail: `${s.points} pts` }));
    const [leader, second] = rows;
    const lead = second ? (season.ticker ?? season.top5)[0].points - (season.ticker ?? season.top5)[1].points : null;
    title = `${leader.driverName} leads`;
    caption = `${landing.year} drivers' championship after ${season.roundsCompleted} of ${season.totalRounds} rounds${lead !== null ? `, ${lead} points clear` : ""}`;
  } else {
    return null;
  }

  return (
    <Chapter id="chapter-grid" number={2} label="The grid" title={title} sectionRef={ref} pinnedHeight={100 + rows.length * 12} reduced={reduced}>
      <p className="mt-4 text-body text-secondary">{caption}</p>
      <ol className="mt-6 grid max-w-3xl grid-cols-1 gap-x-10 sm:grid-cols-2" aria-label={caption}>
        {rows.map((r, i) => (
          <GridRowItem key={r.driver} row={r} position={i + 1} progress={progress} from={(i / rows.length) * 0.7} />
        ))}
      </ol>
    </Chapter>
  );
}

function GridRowItem({ row, position, progress, from }: { row: GridRow; position: number; progress: MotionValue<number>; from: number }) {
  const opacity = useTransform(progress, [from, from + 0.12], [0.12, 1]);
  const x = useTransform(progress, [from, from + 0.12], [-24, 0]);
  return (
    <motion.li style={{ opacity, x }} className="flex items-center gap-3 border-b border-subtle py-2.5">
      {/* The chapter's one red element: the number one. */}
      <span className={`w-6 text-body-sm tabular ${position === 1 ? "font-semibold text-brand-text" : "text-secondary"}`}>{position}</span>
      <DriverIdentity code={row.driver} name={row.driverName} team={row.team} nameVisibility="always" className="min-w-0 flex-1" />
      <span className="text-body-sm tabular text-secondary">{row.detail}</span>
    </motion.li>
  );
}

const CARS = 5;

/** Chapter 3: the circuit draws itself as the reader scrolls, then the model's favourites lap it as dots. */
function Strategy({ landing }: { landing: LandingData }) {
  const ref = useRef<HTMLElement>(null);
  const { progress, reduced } = useChapterProgress(ref);
  const draw = useTransform(progress, [0.05, 0.55], [0, 1]);
  const race = landing.nextRace;
  const drivers = race?.simulation?.drivers ?? [];
  const cars = [...drivers].sort((a, b) => b.p1 - a.p1).slice(0, CARS);
  const nameOf = (code: string) => race?.inputs?.find((i) => i.driver === code)?.driverName ?? code;
  const headline = outlookHeadline(drivers, nameOf);
  const drawing = landing.drawing;
  if (!race) return null;

  return (
    <Chapter id="chapter-strategy" number={3} label="Strategy" title="Ten thousand races" sectionRef={ref} pinnedHeight={drawing ? 260 : 100} reduced={reduced}>
      <div className="mt-6 grid grid-cols-1 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,28rem)] lg:items-center">
        {drawing && (
          <svg aria-hidden viewBox={drawing.viewBox} className="max-h-[42svh] w-full">
            <path d={drawing.path} fill="none" stroke="rgb(255 255 255 / 0.08)" strokeWidth={10} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            <motion.path d={drawing.path} fill="none" stroke="rgb(255 255 255 / 0.7)" strokeWidth={2} vectorEffect="non-scaling-stroke" strokeLinejoin="round" style={{ pathLength: draw }} />
            {cars.map((c, i) => (
              <Car key={c.driver} path={drawing.path} progress={progress} index={i} color={i === 0 ? "#e10600" : teamColor(c.team)} />
            ))}
          </svg>
        )}
        <div className="min-w-0">
          <p className="text-body text-primary">
            {headline ?? `Once qualifying is in, the model simulates the ${race.name} 10,000 times. Its odds appear here.`}
          </p>
          {drivers.length > 0 && (
            <>
              <ProbabilityMeter className="mt-5" caption={`Chance of winning the ${race.name}`} entries={drivers.map((d) => ({ label: d.driver, value: d.p1, color: teamColor(d.team) }))} />
              <ProvenanceLine className="mt-4" source={`Apex model ${race.simulation!.modelVersion}`} status="frozen after qualifying" />
            </>
          )}
        </div>
      </div>
    </Chapter>
  );
}

/** One car: a dot that sets off once the line is drawn, the favourite (red, the chapter's one red element) ahead. */
function Car({ path, progress, index, color }: { path: string; progress: MotionValue<number>; index: number; color: string }) {
  const distance = useTransform(progress, [0.5, 1], [`${0}%`, `${Math.max(0, 92 - index * 4)}%`]);
  return <motion.circle r={6} fill={color} stroke="rgb(0 0 0 / 0.6)" strokeWidth={1.5} style={{ offsetPath: `path("${path}")`, offsetDistance: distance, offsetRotate: "0deg" }} />;
}

/** Chapter 4: the product's core, picking the podium with friends, told over the last real podium. */
function ThePodium({ landing }: { landing: LandingData }) {
  const ref = useRef<HTMLElement>(null);
  const { progress, reduced } = useChapterProgress(ref);
  const last = landing.season?.lastRace;
  const podium = last?.podium ?? [];
  // Second, first, third: the podium's own shape.
  const steps = [podium[1], podium[0], podium[2]].map((p, i) => ({ p, place: [2, 1, 3][i], height: [64, 88, 48][i] }));

  return (
    <Chapter id="chapter-podium" number={4} label="The podium" title="Call it before they do" sectionRef={ref} pinnedHeight={podium.length ? 200 : 100} reduced={reduced}>
      <p className="mt-4 max-w-2xl text-body text-secondary">
        Pick your podium before every Grand Prix, play in a group with your friends, and see who called it when the flag falls.
      </p>
      {podium.length === 3 && last && (
        <figure className="mt-8 max-w-xl">
          <div className="flex items-end gap-2" aria-hidden>
            {steps.map(({ p, place, height }) => (
              <PodiumStep key={place} place={place} height={height} progress={progress} driver={p!.driver} team={p!.team} />
            ))}
          </div>
          <figcaption className="mt-3 text-body-sm text-secondary">
            Last time out, the {last.name}: {podium.map((p) => p.driverName).join(", ")}.
          </figcaption>
        </figure>
      )}
    </Chapter>
  );
}

function PodiumStep({ place, height, progress, driver, team }: { place: number; height: number; progress: MotionValue<number>; driver: string; team: string }) {
  const start = { 1: 0.35, 2: 0.15, 3: 0.25 }[place] ?? 0;
  const scaleY = useTransform(progress, [start, start + 0.25], [0.05, 1]);
  return (
    <div className="flex flex-1 flex-col items-center gap-2">
      <span className="text-body-sm font-semibold text-primary">{driver}</span>
      <motion.div
        className={`flex w-full origin-bottom items-start justify-center rounded-t-control pt-2 text-title-md ${place === 1 ? "bg-brand text-white" : "bg-surface-1 text-secondary"}`}
        style={{ height: `${height * 2}px`, scaleY, borderTop: place === 1 ? undefined : `3px solid ${teamColor(team)}` }}
      >
        {place}
      </motion.div>
    </div>
  );
}

/** Chapter 5: the archive, under a year that slides past as the reader scrolls. */
function TheArchive({ landing }: { landing: LandingData }) {
  const ref = useRef<HTMLElement>(null);
  const reduced = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start end", "end start"] });
  const x = useTransform(scrollYProgress, [0, 1], ["10%", "-30%"]);
  const history = landing.trackHistory;
  return (
    <section ref={ref} className="relative py-16">
      <motion.p aria-hidden className="story-statement whitespace-nowrap text-white/5" style={reduced ? undefined : { x }}>
        1950 · 1950 · 1950
      </motion.p>
      <div className="page-content -mt-8">
        <p className="mb-3 text-body-sm text-secondary">
          Chapter 5 · The archive
          {history && landing.nextRace ? ` · ${history.totalRaces} Grands Prix at ${landing.nextRace.circuit} since ${history.firstYear}` : ""}
        </p>
        <LandingArchiveSection />
      </div>
    </section>
  );
}

/** The finale: the story turns to the reader. */
function YourTurn({ landing }: { landing: LandingData }) {
  const openAuth = useAuthDialogStore((s) => s.open);
  const race = landing.nextRace;
  return (
    <section aria-labelledby="chapter-your-turn" className="page-content flex min-h-[80svh] flex-col justify-center py-16">
      <h2 id="chapter-your-turn" className="story-statement">
        Your turn.
      </h2>
      <p className="mt-6 max-w-2xl text-body text-secondary">
        {race ? `Make your pick for the ${race.name}, ` : "Make your picks, "}
        start a group with your friends, and find out who really knows Formula 1.
      </p>
      <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-3">
        {/* The finale's one red element. */}
        <Button variant="primary" size="lg" onClick={openAuth}>
          Create a free account
        </Button>
        <button
          type="button"
          onClick={openAuth}
          className="rounded-control text-body font-medium text-secondary underline-offset-4 transition-colors duration-fast hover:text-primary hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring"
        >
          I have an account: sign in
        </button>
      </div>
    </section>
  );
}
