"use client";

import { motion } from "framer-motion";

const INK = "#c9a668"; // aged-map ink: warm gold, for labels only now that the route itself is tarmac
const TARMAC = "#33333a";
const CONE_ORANGE = "#ff6a00";

const BEATS = [
  {
    stat: "3 models",
    title: "It calls the race before it starts",
    body: "Three separate models watch every qualifying session the moment it ends: who finishes where, who takes pole, how the pace stacks up. Each is its own Random Forest, walk-forward validated on its own, not one model wearing three hats.",
  },
  {
    stat: "10,000 sims / race",
    title: "It shows its uncertainty, not just an answer",
    body: "A Monte Carlo simulator runs each race ten thousand times with correlated bad luck and good luck built in, a driver's bad day often means their teammate's too, then reports back odds instead of one number pretending to be certain.",
  },
  {
    stat: "1950 to 2017",
    title: "It remembers seventy years of the sport",
    body: "Every season back to 1950, results and all, sourced from the same historical database F1 statisticians use, for settling an argument about who really had the better car in 1976.",
  },
  {
    stat: "Yours, saved",
    title: "It follows your favourites around",
    body: "Pick a driver and a team once, and their standing, points, wins, and podiums show up wherever you land on the site, not buried in a settings page you never open again.",
  },
  {
    stat: "First race to five-hundredth",
    title: "None of it assumes you're already an expert",
    body: "Built for someone watching their first Grand Prix this weekend, and for someone who's been arguing about Imola since before this site existed. Neither has to learn the other's vocabulary to use it.",
  },
];

function CompassRose({ className = "" }: { className?: string }) {
  return (
    <svg viewBox="0 0 100 100" className={className} aria-hidden>
      <circle cx="50" cy="50" r="34" fill="none" stroke="var(--f1-red)" strokeWidth="1" opacity={0.6} />
      <circle cx="50" cy="50" r="3" fill="var(--f1-red)" opacity={0.7} />
      {[0, 90, 180, 270].map((deg) => (
        <line
          key={deg}
          x1="50"
          y1="50"
          x2={50 + 40 * Math.cos((deg * Math.PI) / 180)}
          y2={50 + 40 * Math.sin((deg * Math.PI) / 180)}
          stroke="var(--f1-red)"
          strokeWidth="1"
          opacity={0.6}
        />
      ))}
      <path d="M 50 12 L 57 50 L 50 88 L 43 50 Z" fill="var(--f1-red)" opacity={0.4} />
      <text x="50" y="8" textAnchor="middle" fontSize="8" fill="var(--f1-red)" opacity={0.8}>
        N
      </text>
    </svg>
  );
}

// A traffic cone, not a plain pin - orange body, reflective stripe, dark base - with the
// waypoint number on a small badge at its foot rather than replacing the cone shape entirely.
function Cone({ number }: { number: number }) {
  return (
    <div className="relative flex h-14 w-11 shrink-0 items-center justify-center">
      <svg viewBox="0 0 40 50" className="h-14 w-11" aria-hidden>
        <rect x="3" y="43" width="34" height="6" rx="1.5" fill="#111114" />
        <path d="M 6 46 L 34 46 L 22 10 L 18 10 Z" fill={CONE_ORANGE} />
        <path d="M 11.3 30 L 28.7 30 L 30.7 36 L 9.3 36 Z" fill="#f5f5f5" />
      </svg>
      <span className="absolute -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--f1-carbon)] text-[10px] font-bold text-white ring-1 ring-white/40">
        {number}
      </span>
    </div>
  );
}

// A rounded body with a few overlapping circular bumps along the top edge, the standard
// low-tech way to fake a cloud/thought-bubble shape without an SVG silhouette that would have
// to gracefully fit arbitrary text lengths.
function CloudCallout({ stat, title, body }: { stat: string; title: string; body: string }) {
  return (
    <div className="relative mt-3 max-w-md rounded-[28px] border border-[var(--f1-line)] bg-[var(--f1-carbon)] px-6 py-5 shadow-lg shadow-black/30">
      <span
        aria-hidden
        className="absolute -top-2.5 left-6 h-5 w-5 rounded-full border border-[var(--f1-line)] bg-[var(--f1-carbon)]"
      />
      <span
        aria-hidden
        className="absolute -top-4 left-11 h-7 w-7 rounded-full border border-[var(--f1-line)] bg-[var(--f1-carbon)]"
      />
      <span
        aria-hidden
        className="absolute -top-2 left-[4.5rem] h-4 w-4 rounded-full border border-[var(--f1-line)] bg-[var(--f1-carbon)]"
      />
      <p className="text-xs font-semibold uppercase tracking-wide" style={{ color: INK }}>
        {stat}
      </p>
      <h3 className="mt-1 font-semibold text-white">{title}</h3>
      <p className="mt-2 text-sm leading-relaxed text-neutral-400">{body}</p>
    </div>
  );
}

export function TreasureMapSection() {
  return (
    <div className="relative overflow-hidden rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon-2)] px-6 py-14 sm:px-10">
      <CompassRose className="absolute right-6 top-6 h-16 w-16 sm:right-10 sm:top-10 sm:h-20 sm:w-20" />

      <svg
        viewBox="0 0 400 1200"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-80"
        aria-hidden
      >
        {/* The road surface itself - a real track, not an ink line: wide tarmac stroke, then a
            dashed white centerline drawn in on scroll like lane markings being painted. */}
        <path
          d="M 200 0 C 340 100, 340 200, 200 280 C 60 360, 60 460, 200 540 C 340 620, 340 720, 200 800 C 60 880, 60 980, 200 1060 C 340 1140, 340 1180, 200 1200"
          fill="none"
          stroke={TARMAC}
          strokeWidth={26}
          strokeLinecap="round"
        />
        <motion.path
          d="M 200 0 C 340 100, 340 200, 200 280 C 60 360, 60 460, 200 540 C 340 620, 340 720, 200 800 C 60 880, 60 980, 200 1060 C 340 1140, 340 1180, 200 1200"
          fill="none"
          stroke="#f2f2f3"
          strokeWidth={2}
          strokeDasharray="10 10"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 2, ease: "easeInOut" }}
        />
      </svg>

      <div className="relative space-y-14 sm:space-y-20">
        {BEATS.map((beat, i) => {
          const fromLeft = i % 2 === 0;
          return (
            <motion.div
              key={beat.title}
              initial={{ opacity: 0, y: 24 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-60px" }}
              transition={{ duration: 0.5 }}
              className={`flex ${fromLeft ? "md:justify-start" : "md:justify-end"}`}
            >
              <div className={`flex items-start gap-4 ${fromLeft ? "" : "md:flex-row-reverse"}`}>
                <Cone number={i + 1} />
                <CloudCallout stat={beat.stat} title={beat.title} body={beat.body} />
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, scale: 0.6 }}
        whileInView={{ opacity: 1, scale: 1 }}
        viewport={{ once: true }}
        transition={{ duration: 0.4 }}
        className="relative mt-16 flex flex-col items-center gap-2 text-center"
      >
        <svg viewBox="0 0 40 40" className="h-8 w-8" aria-hidden>
          <line x1="6" y1="6" x2="34" y2="34" stroke={INK} strokeWidth="4" strokeLinecap="round" />
          <line x1="34" y1="6" x2="6" y2="34" stroke={INK} strokeWidth="4" strokeLinecap="round" />
        </svg>
        <p className="text-sm text-neutral-400">You are here.</p>
      </motion.div>
    </div>
  );
}
