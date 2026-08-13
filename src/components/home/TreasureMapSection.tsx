"use client";

import { motion } from "framer-motion";

const INK = "#c9a668"; // aged-map ink: warm gold, for labels only now that the route itself is tarmac
const TARMAC = "#33333a";
const CROWD = ["#c9c9d0", "#9a9aa2", "#e8e8ec", "var(--f1-red)", "#9a9aa2", "#c9c9d0"];

// A handful of fixed positions flanking the winding road, alternating sides down its length -
// purely decorative scenery, not tied to any waypoint.
const TREE_SPOTS: [number, number, number][] = [
  [40, 60, 1],
  [365, 130, 0.8],
  [30, 240, 0.9],
  [370, 340, 1.1],
  [45, 430, 0.85],
  [355, 500, 1],
  [35, 610, 1.05],
  [368, 700, 0.9],
  [40, 790, 1],
  [360, 880, 0.85],
  [35, 970, 1.1],
  [365, 1060, 0.9],
  [50, 1140, 1],
];

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

// Tiered seating, a crowd of small dots, a red roof canopy - a grandstand alongside the track,
// not a cone marking it. The waypoint number sits on a badge at the foot, same as before.
function Grandstand({ number }: { number: number }) {
  const rows = [
    { y: 34, x: 4, w: 42 },
    { y: 26, x: 7, w: 36 },
    { y: 18, x: 10, w: 30 },
  ];
  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
      <svg viewBox="0 0 50 56" className="h-14 w-14" aria-hidden>
        <rect x="8" y="42" width="3" height="10" fill="#3a3a40" />
        <rect x="39" y="42" width="3" height="10" fill="#3a3a40" />
        <path d="M 2 18 L 25 5 L 48 18 Z" fill="var(--f1-red)" />
        {rows.map((row, r) => (
          <g key={r}>
            <rect x={row.x} y={row.y} width={row.w} height={8} fill={r % 2 === 0 ? "#4a4a52" : "#3e3e46"} />
            {Array.from({ length: 6 }, (_, i) => (
              <circle
                key={i}
                cx={row.x + 4 + i * ((row.w - 8) / 5)}
                cy={row.y + 4}
                r={1.4}
                fill={CROWD[(r + i) % CROWD.length]}
              />
            ))}
          </g>
        ))}
      </svg>
      <span className="absolute -bottom-1 flex h-5 w-5 items-center justify-center rounded-full bg-[var(--f1-carbon)] text-[10px] font-bold text-white ring-1 ring-white/40">
        {number}
      </span>
    </div>
  );
}

function Tree({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={0.5}>
      <rect x="-2" y="10" width="4" height="10" fill="#4a3b2f" />
      <circle cx="0" cy="2" r="9" fill="#3f5a44" />
      <circle cx="-6" cy="7" r="6" fill="#3a5340" />
      <circle cx="6" cy="7" r="6" fill="#3a5340" />
    </g>
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
    <div className="relative overflow-hidden bg-[var(--background)] px-6 py-14 sm:px-10">
      <CompassRose className="absolute right-6 top-6 h-16 w-16 sm:right-10 sm:top-10 sm:h-20 sm:w-20" />

      <svg
        viewBox="0 0 400 1200"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full opacity-80"
        aria-hidden
      >
        {TREE_SPOTS.map(([x, y, scale], i) => (
          <Tree key={i} x={x} y={y} scale={scale} />
        ))}

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
                <Grandstand number={i + 1} />
                <CloudCallout stat={beat.stat} title={beat.title} body={beat.body} />
              </div>
            </motion.div>
          );
        })}
      </div>

      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.5 }}
        className="relative mt-16 flex flex-col items-center gap-2 text-center"
      >
        <svg viewBox="0 0 120 74" className="h-16 w-24" aria-hidden>
          <rect x="4" y="34" width="32" height="34" fill="#6b6b74" />
          <text x="20" y="55" textAnchor="middle" fontSize="16" fontWeight="700" fill="white">
            2
          </text>
          <rect x="44" y="12" width="32" height="56" fill="var(--f1-red)" />
          <text x="60" y="45" textAnchor="middle" fontSize="18" fontWeight="700" fill="white">
            1
          </text>
          <rect x="84" y="42" width="32" height="26" fill="#4a4a52" />
          <text x="100" y="60" textAnchor="middle" fontSize="14" fontWeight="700" fill="white">
            3
          </text>
        </svg>
        <p className="text-sm text-neutral-400">That&apos;s the whole lap.</p>
      </motion.div>
    </div>
  );
}
