"use client";

import { motion } from "framer-motion";
import { ValleyScene } from "@/components/three/ValleyScene";

const INK = "#c9a668"; // aged-map ink: warm gold, for the stat labels
const CROWD = ["#c9c9d0", "#9a9aa2", "#e8e8ec", "var(--f1-red)", "#9a9aa2", "#c9c9d0"];

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

function MapDefs() {
  return (
    <defs>
      <linearGradient id="standGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#5c5c66" />
        <stop offset="100%" stopColor="#31313a" />
      </linearGradient>
      <linearGradient id="roofGradient" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ff3b30" />
        <stop offset="100%" stopColor="#a5030a" />
      </linearGradient>
      <linearGradient id="podiumGold" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#ff453d" />
        <stop offset="100%" stopColor="#96030a" />
      </linearGradient>
      <linearGradient id="podiumSilver" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#aaaab3" />
        <stop offset="100%" stopColor="#63636c" />
      </linearGradient>
      <linearGradient id="podiumBronze" x1="0" y1="0" x2="0" y2="1">
        <stop offset="0%" stopColor="#71717a" />
        <stop offset="100%" stopColor="#414149" />
      </linearGradient>
      <filter id="softShadow" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000" floodOpacity="0.4" />
      </filter>
    </defs>
  );
}

// Tiered seating with shaded rows, a scattered crowd, a two-tone roof with a ridge line and
// support struts, and a ground shadow - a grandstand with some real dimension to it, not a flat
// cutout. The waypoint number sits on a badge at the foot.
function Grandstand({ number }: { number: number }) {
  const rows = [
    { y: 34, x: 4, w: 42 },
    { y: 26, x: 7, w: 36 },
    { y: 18, x: 10, w: 30 },
  ];
  return (
    <div className="relative flex h-16 w-16 shrink-0 items-center justify-center">
      <svg viewBox="0 0 50 58" className="h-16 w-16" aria-hidden>
        <ellipse cx="25" cy="53" rx="20" ry="3" fill="#000" opacity={0.35} />
        <rect x="8" y="42" width="3" height="10" fill="#3a3a40" />
        <rect x="39" y="42" width="3" height="10" fill="#3a3a40" />
        <line x1="25" y1="6" x2="8" y2="18" stroke="#8a1a10" strokeWidth="1.2" />
        <line x1="25" y1="6" x2="42" y2="18" stroke="#8a1a10" strokeWidth="1.2" />
        <path d="M 2 18 L 25 5 L 48 18 Z" fill="url(#roofGradient)" filter="url(#softShadow)" />
        <line x1="25" y1="5" x2="25" y2="18" stroke="#7a0208" strokeWidth="1" opacity={0.5} />
        {rows.map((row, r) => (
          <g key={r}>
            <rect x={row.x} y={row.y} width={row.w} height={8} fill="url(#standGradient)" />
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
    <div className="relative">
      {/* Defs shared by every Grandstand/podium svg below via document-wide id lookup - one copy
          rather than one per instance. */}
      <svg width={0} height={0} aria-hidden>
        <MapDefs />
      </svg>

      <ValleyScene />

      <div className="relative mt-10 space-y-14 sm:space-y-20">
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

        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          transition={{ duration: 0.5 }}
          className="flex flex-col items-center gap-2 pt-4 text-center"
        >
          <svg viewBox="0 0 120 84" className="h-16 w-24" aria-hidden>
            <ellipse cx="60" cy="70" rx="56" ry="4" fill="#000" opacity={0.35} />
            <path
              d="M 58 4 L 62 12 L 70 13 L 64 19 L 66 27 L 58 22 L 50 27 L 52 19 L 46 13 L 54 12 Z"
              fill="var(--f1-red)"
            />
            <rect x="4" y="34" width="32" height="34" fill="url(#podiumSilver)" filter="url(#softShadow)" />
            <text x="20" y="55" textAnchor="middle" fontSize="16" fontWeight="700" fill="white">
              2
            </text>
            <rect x="44" y="12" width="32" height="56" fill="url(#podiumGold)" filter="url(#softShadow)" />
            <text x="60" y="45" textAnchor="middle" fontSize="18" fontWeight="700" fill="white">
              1
            </text>
            <rect x="84" y="42" width="32" height="26" fill="url(#podiumBronze)" filter="url(#softShadow)" />
            <text x="100" y="60" textAnchor="middle" fontSize="14" fontWeight="700" fill="white">
              3
            </text>
          </svg>
          <p className="text-sm text-neutral-400">That&apos;s the whole lap.</p>
        </motion.div>
      </div>
    </div>
  );
}
