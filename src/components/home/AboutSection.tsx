"use client";

import { useRef } from "react";
import { motion, useMotionValue, useSpring, type MotionValue } from "framer-motion";
import { useAuth } from "@/components/auth/AuthProvider";
import { staggerContainer, staggerItem } from "@/components/motion/variants";

// A winding circuit line, not a real one — five corners, each a different part of the site,
// walked in order the way a fan actually moves through it: watch the prediction, see the range
// of outcomes behind it, look up how the track's run before, make it yours, and realize none of
// that assumed any prior F1 knowledge to begin with.
const CORNERS = [
  { x: 40, y: 190 },
  { x: 340, y: 110 },
  { x: 620, y: 170 },
  { x: 860, y: 70 },
  { x: 960, y: 130 },
];
const TRACK_PATH =
  "M 40 190 C 140 60, 260 40, 340 110 C 430 190, 540 210, 620 170 C 700 130, 780 20, 860 70 C 910 100, 930 110, 960 130";

const BEATS = [
  {
    title: "It calls the race before it starts",
    body: "Three separate models watch every qualifying session the moment it ends: who finishes where, who takes pole, how the pace stacks up.",
  },
  {
    title: "It shows its uncertainty, not just an answer",
    body: "A Monte Carlo simulator runs each race ten thousand times with bad luck and good luck built in, then reports back odds instead of one number pretending to be certain.",
  },
  {
    title: "It remembers seventy years of the sport",
    body: "Every season from 1950 onward, results and all, for settling an argument about who really had the better car in 1976.",
  },
  {
    title: "It follows your favourites around",
    body: "Pick a driver and a team once, and their standing, points, and podiums show up wherever you land on the site.",
  },
  {
    title: "None of it assumes you're already an expert",
    body: "Built for someone watching their first Grand Prix this weekend, and for someone who's been arguing about Imola since before this site existed.",
  },
];

function useTilt() {
  const rotateX = useSpring(useMotionValue(0), { stiffness: 150, damping: 20 });
  const rotateY = useSpring(useMotionValue(0), { stiffness: 150, damping: 20 });

  function onMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width - 0.5;
    const py = (e.clientY - rect.top) / rect.height - 0.5;
    rotateY.set(px * 10);
    rotateX.set(py * -10);
  }
  function onMouseLeave() {
    rotateX.set(0);
    rotateY.set(0);
  }

  return { rotateX, rotateY, onMouseMove, onMouseLeave };
}

function TrackMap({ rotateX, rotateY, ...handlers }: ReturnType<typeof useTilt>) {
  return (
    <div className="[perspective:1200px]">
      <motion.div
        onMouseMove={handlers.onMouseMove}
        onMouseLeave={handlers.onMouseLeave}
        style={{ rotateX: rotateX as MotionValue<number>, rotateY: rotateY as MotionValue<number> }}
        className="rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-6"
      >
        <svg viewBox="0 0 1000 240" className="h-auto w-full" aria-hidden>
          <motion.path
            d={TRACK_PATH}
            fill="none"
            stroke="var(--f1-line)"
            strokeWidth={14}
            strokeLinecap="round"
          />
          <motion.path
            d={TRACK_PATH}
            fill="none"
            stroke="var(--f1-red)"
            strokeWidth={2}
            strokeDasharray="10 10"
            strokeLinecap="round"
            initial={{ pathLength: 0 }}
            whileInView={{ pathLength: 1 }}
            viewport={{ once: true }}
            transition={{ duration: 1.4, ease: "easeInOut" }}
          />
          {CORNERS.map((c, i) => (
            <g key={i}>
              <circle cx={c.x} cy={c.y} r={16} fill="var(--f1-carbon)" stroke="var(--f1-red)" strokeWidth={2} />
              <text
                x={c.x}
                y={c.y}
                textAnchor="middle"
                dominantBaseline="central"
                className="fill-white text-[13px] font-bold"
              >
                {i + 1}
              </text>
            </g>
          ))}
        </svg>
      </motion.div>
    </div>
  );
}

export function AboutSection() {
  const { user, signInWithGoogle } = useAuth();
  const tilt = useTilt();
  const containerRef = useRef<HTMLDivElement>(null);

  return (
    <div ref={containerRef}>
      <h2 className="mb-2 text-sm font-semibold uppercase tracking-[0.2em] text-[var(--f1-red)]">
        How this works
      </h2>
      <p className="mb-8 max-w-2xl text-2xl font-bold text-white">
        F1 Hub follows the sport the way a fan actually does. Five corners, one lap.
      </p>

      <TrackMap {...tilt} />

      <motion.div
        initial="hidden"
        whileInView="show"
        viewport={{ once: true, margin: "-80px" }}
        variants={staggerContainer}
        className="mt-8 space-y-3"
      >
        {BEATS.map((beat, i) => (
          <motion.div
            key={beat.title}
            variants={staggerItem}
            className="flex gap-4 rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-5 py-4"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-[var(--f1-red)] text-sm font-bold text-white">
              {i + 1}
            </span>
            <div>
              <h3 className="font-semibold text-white">{beat.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-neutral-400">{beat.body}</p>
            </div>
          </motion.div>
        ))}
      </motion.div>

      {!user && (
        <div className="mt-6 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-6 py-5">
          <p className="text-sm text-neutral-400">See it running on the current season.</p>
          <button
            onClick={() => void signInWithGoogle()}
            className="rounded-full bg-[var(--f1-red)] px-5 py-2 text-sm font-semibold text-white transition hover:brightness-110 active:brightness-95"
          >
            Sign in with Google
          </button>
        </div>
      )}
    </div>
  );
}
