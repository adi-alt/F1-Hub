"use client";

import { useEffect, useRef } from "react";
import { motion, useMotionValue, type MotionValue } from "framer-motion";

const INK = "#c9a668"; // aged-map ink: warm gold, for labels only now that the route itself is tarmac
const TARMAC = "#33333a";
const GRASS = "#33502f";
const CROWD = ["#c9c9d0", "#9a9aa2", "#e8e8ec", "var(--f1-red)", "#9a9aa2", "#c9c9d0"];
const TRACK_PATH =
  "M 200 0 C 340 100, 340 200, 200 280 C 60 360, 60 460, 200 540 C 340 620, 340 720, 200 800 C 60 880, 60 980, 200 1060 C 340 1140, 340 1180, 200 1200";

// Deterministic, not Math.random() - a server-rendered and client-rendered pass have to agree on
// every position or React throws a hydration mismatch. Enough trees, varied enough in scale,
// side-offset, and species, to read as a treeline rather than a few sparse plantings. variant
// cycles round/pine/palm so it isn't the same silhouette repeated 26 times.
const TREE_COUNT = 30;
const TREE_SPOTS: [number, number, number, number][] = Array.from({ length: TREE_COUNT }, (_, i) => {
  const y = 15 + i * (1170 / (TREE_COUNT - 1));
  const side = i % 2 === 0 ? -1 : 1;
  const wiggle = Math.sin(i * 2.3) * 20;
  const x = side === -1 ? 50 + wiggle : 350 + wiggle;
  const scale = 0.7 + Math.abs(Math.sin(i * 1.7)) * 0.55;
  return [x, y, scale, i % 3];
});

// Fixed mountain ranges framing the scene on both sides - not tied to the section's edges by
// math, just placed to sit near x=0 and x=400 so they read as distant peaks either side of the
// track rather than boxed decoration.
const MOUNTAINS: { x: number; y: number; w: number; h: number; shade: string }[] = [
  { x: -40, y: 10, w: 160, h: 200, shade: "#232b38" },
  { x: -20, y: 190, w: 140, h: 170, shade: "#1c222c" },
  { x: -45, y: 430, w: 170, h: 210, shade: "#232b38" },
  { x: -15, y: 690, w: 150, h: 180, shade: "#1c222c" },
  { x: -40, y: 930, w: 165, h: 210, shade: "#232b38" },
  { x: -20, y: 1170, w: 150, h: 190, shade: "#1c222c" },
  { x: 300, y: 0, w: 160, h: 190, shade: "#1c222c" },
  { x: 330, y: 180, w: 140, h: 170, shade: "#232b38" },
  { x: 295, y: 420, w: 170, h: 200, shade: "#1c222c" },
  { x: 325, y: 680, w: 150, h: 180, shade: "#232b38" },
  { x: 295, y: 920, w: 165, h: 210, shade: "#1c222c" },
  { x: 320, y: 1170, w: 150, h: 190, shade: "#232b38" },
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

function MapDefs() {
  return (
    <defs>
      <radialGradient id="treeGradient" cx="35%" cy="30%" r="75%">
        <stop offset="0%" stopColor="#5f8564" />
        <stop offset="100%" stopColor="#2c4330" />
      </radialGradient>
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
      <radialGradient id="carGradient" cx="35%" cy="30%" r="80%">
        <stop offset="0%" stopColor="#ff4136" />
        <stop offset="100%" stopColor="#a5030a" />
      </radialGradient>
      <filter id="softShadow" x="-60%" y="-60%" width="220%" height="220%">
        <feDropShadow dx="0" dy="3" stdDeviation="2.5" floodColor="#000" floodOpacity="0.4" />
      </filter>
    </defs>
  );
}

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

function Mountain({ x, y, w, h, shade }: { x: number; y: number; w: number; h: number; shade: string }) {
  const peakX = x + w / 2;
  return (
    <g opacity={0.9}>
      <path d={`M ${x} ${y + h} L ${peakX} ${y} L ${x + w} ${y + h} Z`} fill={shade} />
      <path
        d={`M ${peakX - w * 0.13} ${y + h * 0.16} L ${peakX} ${y} L ${peakX + w * 0.13} ${y + h * 0.16} L ${peakX} ${y + h * 0.09} Z`}
        fill="#5a6b80"
        opacity={0.55}
      />
    </g>
  );
}

// Round deciduous canopy, three overlapping circles - the original tree, kept as one of three
// species scattered through the scene now.
function RoundTree({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={0.75}>
      <ellipse cx="0" cy="16" rx="7" ry="1.6" fill="#000" opacity={0.3} />
      <path d="M -1.6 4 L 1.6 4 L 2.6 14 L -2.6 14 Z" fill="#4a3b2f" />
      <circle cx="-5" cy="5" r="5.5" fill="url(#treeGradient)" />
      <circle cx="5" cy="4" r="6" fill="url(#treeGradient)" />
      <circle cx="0" cy="-3" r="7.5" fill="url(#treeGradient)" />
      <circle cx="0" cy="0" r="6.5" fill="url(#treeGradient)" opacity={0.9} />
    </g>
  );
}

// A conifer - trunk plus three stacked triangles narrowing toward the top.
function PineTree({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={0.75}>
      <ellipse cx="0" cy="18" rx="6" ry="1.4" fill="#000" opacity={0.3} />
      <rect x="-1.3" y="10" width="2.6" height="9" fill="#4a3b2f" />
      <path d="M 0 -10 L 7 4 L -7 4 Z" fill="#274a30" />
      <path d="M 0 -4 L 6 8 L -6 8 Z" fill="#2f5838" />
      <path d="M 0 2 L 6.5 12 L -6.5 12 Z" fill="#376640" />
    </g>
  );
}

// A palm - curved trunk, five fronds fanning from the top.
function PalmTree({ x, y, scale }: { x: number; y: number; scale: number }) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`} opacity={0.75}>
      <ellipse cx="2" cy="20" rx="6" ry="1.4" fill="#000" opacity={0.3} />
      <path d="M 0 20 C -2 10, 1 2, 3 -6" stroke="#6b4a2f" strokeWidth="2.2" fill="none" strokeLinecap="round" />
      <path d="M 3 -6 C -4 -10, -9 -8, -12 -3" stroke="#3f7a48" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M 3 -6 C -2 -13, -6 -15, -10 -14" stroke="#3f7a48" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M 3 -6 C 3 -14, 6 -17, 6 -19" stroke="#3f7a48" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M 3 -6 C 8 -13, 12 -13, 15 -10" stroke="#3f7a48" strokeWidth="2" fill="none" strokeLinecap="round" />
      <path d="M 3 -6 C 9 -8, 13 -6, 15 -2" stroke="#3f7a48" strokeWidth="2" fill="none" strokeLinecap="round" />
    </g>
  );
}

const TREE_VARIANTS = [RoundTree, PineTree, PalmTree];

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

// A top-down car, nose pointing along +x in its own local space, rotated to match the road's
// tangent at whatever point on the route the scroll position corresponds to.
function MovingCar({
  pathRef,
  sectionRef,
}: {
  pathRef: React.RefObject<SVGPathElement | null>;
  sectionRef: React.RefObject<HTMLDivElement | null>;
}) {
  const x = useMotionValue(200);
  const y = useMotionValue(0);
  const rotate = useMotionValue(90);

  useEffect(() => {
    if (!sectionRef.current || !pathRef.current) return;
    const section: HTMLDivElement = sectionRef.current;
    const path: SVGPathElement = pathRef.current;

    let scrollParent: HTMLElement | Window = window;
    let node = section.parentElement;
    while (node) {
      if (getComputedStyle(node).overflowY === "auto") {
        scrollParent = node;
        break;
      }
      node = node.parentElement;
    }

    let raf = 0;
    function update() {
      const rect = section.getBoundingClientRect();
      const viewportHeight = scrollParent === window ? window.innerHeight : (scrollParent as HTMLElement).clientHeight;
      const progress = Math.min(1, Math.max(0, (viewportHeight - rect.top) / (rect.height + viewportHeight)));
      const total = path.getTotalLength();
      const len = progress * total;
      const point = path.getPointAtLength(len);
      const ahead = path.getPointAtLength(Math.min(len + 2, total));
      x.set(point.x);
      y.set(point.y);
      rotate.set((Math.atan2(ahead.y - point.y, ahead.x - point.x) * 180) / Math.PI);
    }
    function onScroll() {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    }

    update();
    scrollParent.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll);
    return () => {
      cancelAnimationFrame(raf);
      scrollParent.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
    };
  }, [pathRef, sectionRef, x, y, rotate]);

  return (
    <motion.g style={{ x, y, rotate } as Record<string, MotionValue<number>>} filter="url(#softShadow)">
      <ellipse cx="0" cy="0" rx="10" ry="5" fill="url(#carGradient)" />
      <rect x="-6" y="-2.4" width="8" height="4.8" rx="1.4" fill="#15151a" />
      <circle cx="-6" cy="-5.6" r="1.7" fill="#0c0c0e" />
      <circle cx="-6" cy="5.6" r="1.7" fill="#0c0c0e" />
      <circle cx="4" cy="-5.6" r="1.7" fill="#0c0c0e" />
      <circle cx="4" cy="5.6" r="1.7" fill="#0c0c0e" />
    </motion.g>
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
  const sectionRef = useRef<HTMLDivElement>(null);
  const pathRef = useRef<SVGPathElement>(null);

  return (
    <div ref={sectionRef} className="relative overflow-hidden px-6 py-14 sm:px-10">
      <CompassRose className="absolute right-6 top-6 h-16 w-16 sm:right-10 sm:top-10 sm:h-20 sm:w-20" />

      <svg
        viewBox="0 0 400 1200"
        preserveAspectRatio="none"
        className="pointer-events-none absolute inset-0 h-full w-full"
        aria-hidden
      >
        <MapDefs />

        {MOUNTAINS.map((m, i) => (
          <Mountain key={i} {...m} />
        ))}

        {/* Grass runoff either side of the tarmac - the same path, a wider and lower stroke. */}
        <path d={TRACK_PATH} fill="none" stroke={GRASS} strokeWidth={90} strokeLinecap="round" />

        {TREE_SPOTS.map(([x, y, scale, variant], i) => {
          const TreeVariant = TREE_VARIANTS[variant];
          return <TreeVariant key={i} x={x} y={y} scale={scale} />;
        })}

        {/* The road surface itself - a real track, not an ink line: wide tarmac stroke, then a
            dashed white centerline drawn in on scroll like lane markings being painted. */}
        <path ref={pathRef} d={TRACK_PATH} fill="none" stroke={TARMAC} strokeWidth={44} strokeLinecap="round" />
        <motion.path
          d={TRACK_PATH}
          fill="none"
          stroke="#f2f2f3"
          strokeWidth={3}
          strokeDasharray="12 12"
          strokeLinecap="round"
          initial={{ pathLength: 0 }}
          whileInView={{ pathLength: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 2, ease: "easeInOut" }}
        />

        <MovingCar pathRef={pathRef} sectionRef={sectionRef} />
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
  );
}
