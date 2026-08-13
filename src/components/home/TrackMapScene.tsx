"use client";

import { useEffect, useRef, useState } from "react";
import { Canvas } from "@react-three/fiber";
import { Html, Line } from "@react-three/drei";

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

// Five points around a circle, connected two ways: the outer perimeter (the reading order,
// 1-2-3-4-5) and the chords skipping one vertex each time — the second set is what actually
// crosses itself, the classic way to draw a five-pointed star from five dots on a map.
const COUNT = BEATS.length;
const RADIUS = 3.3;
const POINTS = Array.from({ length: COUNT }, (_, i) => {
  const angle = -Math.PI / 2 + i * ((2 * Math.PI) / COUNT);
  return [Math.cos(angle) * RADIUS, 0, Math.sin(angle) * RADIUS] as [number, number, number];
});
const PERIMETER_EDGES = POINTS.map((_, i) => [POINTS[i], POINTS[(i + 1) % COUNT]]);
const CROSSING_EDGES = POINTS.map((_, i) => [POINTS[i], POINTS[(i + 2) % COUNT]]);

function Cone({
  position,
  index,
  active,
  onEnter,
  onLeave,
  onToggle,
}: {
  position: [number, number, number];
  index: number;
  active: boolean;
  onEnter: () => void;
  onLeave: () => void;
  onToggle: () => void;
}) {
  return (
    <group position={position}>
      <mesh
        position={[0, 0.3, 0]}
        onPointerOver={(e) => {
          e.stopPropagation();
          onEnter();
        }}
        onPointerOut={onLeave}
        onClick={(e) => {
          e.stopPropagation();
          onToggle();
        }}
        scale={active ? 1.15 : 1}
      >
        <coneGeometry args={[0.3, 0.62, 20]} />
        <meshStandardMaterial color={active ? "#ff8a3d" : "#ff6a00"} roughness={0.5} />
      </mesh>

      <Html position={[0, 0.95, 0]} center distanceFactor={10} className="pointer-events-none select-none">
        <span className="flex h-6 w-6 items-center justify-center rounded-full border border-white/40 bg-black/70 text-[11px] font-bold text-white">
          {index + 1}
        </span>
      </Html>

      {active && (
        <Html position={[0, 1.5, 0]} center distanceFactor={9} zIndexRange={[100, 0]}>
          <div className="w-56 rounded-xl border border-[var(--f1-line)] bg-[var(--f1-carbon)] p-3 text-left shadow-xl shadow-black/50">
            <p className="text-sm font-semibold text-white">{BEATS[index].title}</p>
            <p className="mt-1 text-xs leading-relaxed text-neutral-400">{BEATS[index].body}</p>
          </div>
        </Html>
      )}
    </group>
  );
}

function Scene() {
  const [active, setActive] = useState<number | null>(null);

  return (
    <>
      <color attach="background" args={["#0a0a0c"]} />
      <ambientLight intensity={0.5} />
      <directionalLight position={[4, 6, 3]} intensity={1.1} />
      <directionalLight position={[-4, 3, -3]} intensity={0.4} color="#8fb4ff" />

      {PERIMETER_EDGES.map(([a, b], i) => (
        <Line key={`p${i}`} points={[a, b]} color="#e10600" lineWidth={1.5} />
      ))}
      {CROSSING_EDGES.map(([a, b], i) => (
        <Line key={`c${i}`} points={[a, b]} color="#ffffff" transparent opacity={0.25} lineWidth={1} dashed dashSize={0.15} gapSize={0.12} />
      ))}

      {POINTS.map((p, i) => (
        <Cone
          key={i}
          position={p}
          index={i}
          active={active === i}
          onEnter={() => setActive(i)}
          onLeave={() => setActive((prev) => (prev === i ? null : prev))}
          onToggle={() => setActive((prev) => (prev === i ? null : i))}
        />
      ))}
    </>
  );
}

// The scene is inert geometry (no GLTF, nothing to Suspend on) but WebGL still isn't free — this
// section can sit well below the fold, so the canvas only mounts once it's actually about to be
// seen rather than paying for it on every page load regardless of how far anyone scrolls.
export function TrackMapScene() {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = wrapperRef.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setInView(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div
      ref={wrapperRef}
      className="h-[420px] w-full overflow-hidden rounded-2xl border border-[var(--f1-line)] bg-[var(--f1-carbon)]"
    >
      {inView && (
        <Canvas camera={{ position: [0, 6, 9], fov: 42 }} dpr={[1, 1.75]}>
          <Scene />
        </Canvas>
      )}
    </div>
  );
}
