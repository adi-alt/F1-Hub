"use client";

import { useEffect, useRef, useState, type RefObject } from "react";
import { Canvas } from "@react-three/fiber";
import { ContactShadows } from "@react-three/drei";
import * as THREE from "three";

const GRASS = "#2f4a2c";
const TARMAC = "#33333a";

// A gentle S down the visible length of the valley - z=25 is nearest the camera, z=-60 is
// farthest, everything (mountains, trees, the car's path) is laid out against this same range.
const ROAD_CURVE = new THREE.CatmullRomCurve3([
  new THREE.Vector3(0, 0, 25),
  new THREE.Vector3(3.5, 0, 5),
  new THREE.Vector3(-3, 0, -15),
  new THREE.Vector3(2.5, 0, -38),
  new THREE.Vector3(0, 0, -60),
]);

const MOUNTAIN_SPOTS = Array.from({ length: 12 }, (_, i) => {
  const z = 22 - i * 8;
  const side = i % 2 === 0 ? -1 : 1;
  const x = side * (9 + Math.abs(Math.sin(i * 1.3)) * 4);
  const height = 9 + Math.abs(Math.sin(i * 2.1)) * 5;
  const radius = 5 + Math.abs(Math.cos(i * 1.7)) * 2;
  return { x, z, height, radius, key: i };
});

const TREE_SPOTS = Array.from({ length: 26 }, (_, i) => {
  const z = 24 - i * 3.2;
  const side = i % 2 === 0 ? -1 : 1;
  const x = side * (4.5 + Math.abs(Math.sin(i * 1.9)) * 2.5);
  const scale = 0.7 + Math.abs(Math.sin(i * 1.4)) * 0.5;
  return { x, z, scale, variant: i % 3, key: i };
});

function Mountain({ x, z, height, radius }: { x: number; z: number; height: number; radius: number }) {
  return (
    <group position={[x, 0, z]}>
      <mesh position={[0, height / 2, 0]} castShadow receiveShadow>
        <coneGeometry args={[radius, height, 7]} />
        <meshStandardMaterial color="#3a4352" roughness={0.95} flatShading />
      </mesh>
      <mesh position={[0, height * 0.82, 0]} castShadow>
        <coneGeometry args={[radius * 0.32, height * 0.32, 7]} />
        <meshStandardMaterial color="#eef2f6" roughness={0.6} flatShading />
      </mesh>
    </group>
  );
}

function PineTree({ x, z, scale }: { x: number; z: number; scale: number }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.6, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 1.2, 6]} />
        <meshStandardMaterial color="#4a3b2f" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.6, 0]} castShadow>
        <coneGeometry args={[0.9, 1.6, 7]} />
        <meshStandardMaterial color="#274a30" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0, 2.3, 0]} castShadow>
        <coneGeometry args={[0.7, 1.3, 7]} />
        <meshStandardMaterial color="#2f5838" roughness={0.85} flatShading />
      </mesh>
      <mesh position={[0, 2.9, 0]} castShadow>
        <coneGeometry args={[0.5, 1, 7]} />
        <meshStandardMaterial color="#376640" roughness={0.85} flatShading />
      </mesh>
    </group>
  );
}

function RoundTree({ x, z, scale }: { x: number; z: number; scale: number }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0, 0.5, 0]} castShadow>
        <cylinderGeometry args={[0.08, 0.1, 1, 6]} />
        <meshStandardMaterial color="#4a3b2f" roughness={0.9} />
      </mesh>
      <mesh position={[0, 1.3, 0]} castShadow>
        <icosahedronGeometry args={[0.75, 0]} />
        <meshStandardMaterial color="#4a7d52" roughness={0.85} flatShading />
      </mesh>
    </group>
  );
}

function PalmTree({ x, z, scale }: { x: number; z: number; scale: number }) {
  return (
    <group position={[x, 0, z]} scale={scale}>
      <mesh position={[0.15, 0.9, 0]} rotation={[0, 0, 0.12]} castShadow>
        <cylinderGeometry args={[0.07, 0.11, 1.8, 6]} />
        <meshStandardMaterial color="#6b4a2f" roughness={0.9} />
      </mesh>
      {[0, 1, 2, 3, 4].map((i) => (
        <mesh key={i} position={[0.25, 1.85, 0]} rotation={[0.55, (i / 5) * Math.PI * 2, 0]} castShadow>
          <coneGeometry args={[0.12, 1.1, 4]} />
          <meshStandardMaterial color="#3f8a4a" roughness={0.8} flatShading />
        </mesh>
      ))}
    </group>
  );
}

const TREE_VARIANTS = [RoundTree, PineTree, PalmTree];

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

function Road() {
  return (
    <>
      <mesh position={[0, -0.03, 0]} scale={[1, 0.02, 1]} receiveShadow>
        <tubeGeometry args={[ROAD_CURVE, 100, 5.5, 8, false]} />
        <meshStandardMaterial color={GRASS} roughness={1} />
      </mesh>
      <mesh position={[0, -0.01, 0]} scale={[1, 0.02, 1]} receiveShadow>
        <tubeGeometry args={[ROAD_CURVE, 100, 2.6, 8, false]} />
        <meshStandardMaterial color={TARMAC} roughness={0.7} />
      </mesh>
    </>
  );
}

// Scroll progress through the banner (not the whole page) drives where the car sits on the
// curve - imperative position updates on the group each scroll tick, same viewport-visibility
// math as the old SVG version, just applied to a 3D point instead of an SVG path length.
function Car({ bannerRef }: { bannerRef: RefObject<HTMLDivElement | null> }) {
  const groupRef = useRef<THREE.Group>(null);

  useEffect(() => {
    if (!bannerRef.current) return;
    const banner: HTMLDivElement = bannerRef.current;

    let scrollParent: HTMLElement | Window = window;
    let node = banner.parentElement;
    while (node) {
      if (getComputedStyle(node).overflowY === "auto") {
        scrollParent = node;
        break;
      }
      node = node.parentElement;
    }

    let raf = 0;
    function update() {
      const rect = banner.getBoundingClientRect();
      const viewportHeight = scrollParent === window ? window.innerHeight : (scrollParent as HTMLElement).clientHeight;
      const progress = Math.min(1, Math.max(0, (viewportHeight - rect.top) / (rect.height + viewportHeight)));
      const point = ROAD_CURVE.getPointAt(progress);
      const tangent = ROAD_CURVE.getTangentAt(progress);
      const group = groupRef.current;
      if (group) {
        group.position.set(point.x, 0.15, point.z);
        group.rotation.y = Math.atan2(tangent.x, tangent.z);
      }
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
  }, [bannerRef]);

  return (
    <group ref={groupRef}>
      <mesh castShadow position={[0, 0.18, 0]}>
        <boxGeometry args={[0.6, 0.22, 1.1]} />
        <meshStandardMaterial color="#e10600" roughness={0.35} metalness={0.2} />
      </mesh>
      <mesh castShadow position={[0, 0.32, -0.1]}>
        <boxGeometry args={[0.4, 0.16, 0.5]} />
        <meshStandardMaterial color="#15151a" roughness={0.5} />
      </mesh>
      {[
        [-0.32, -0.35],
        [0.32, -0.35],
        [-0.32, 0.35],
        [0.32, 0.35],
      ].map(([wx, wz], i) => (
        <mesh key={i} position={[wx, 0.08, wz]} rotation={[0, 0, Math.PI / 2]} castShadow>
          <cylinderGeometry args={[0.1, 0.1, 0.12, 10]} />
          <meshStandardMaterial color="#0c0c0e" roughness={0.6} />
        </mesh>
      ))}
    </group>
  );
}

function Scene({ bannerRef }: { bannerRef: RefObject<HTMLDivElement | null> }) {
  return (
    <>
      <color attach="background" args={["#0a0a0c"]} />
      <fog attach="fog" args={["#0a0a0c", 28, 95]} />
      <ambientLight intensity={0.45} />
      <hemisphereLight args={["#4a6fb0", "#233018", 0.55]} />
      <directionalLight position={[18, 26, 12]} intensity={1.5} castShadow shadow-mapSize={[1024, 1024]} />

      <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -0.05, -15]} receiveShadow>
        <planeGeometry args={[90, 150]} />
        <meshStandardMaterial color={GRASS} roughness={1} />
      </mesh>

      <Road />
      {MOUNTAIN_SPOTS.map((m) => (
        <Mountain key={m.key} x={m.x} z={m.z} height={m.height} radius={m.radius} />
      ))}
      {TREE_SPOTS.map((t) => {
        const TreeVariant = TREE_VARIANTS[t.variant];
        return <TreeVariant key={t.key} x={t.x} z={t.z} scale={t.scale} />;
      })}
      <Car bannerRef={bannerRef} />
      <ContactShadows position={[0, 0.001, 0]} opacity={0.5} scale={30} blur={2} far={20} />
    </>
  );
}

// A real WebGL scene, not flat SVG - proper lighting, shadows, and fog read as dimensional in a
// way vector shapes with gradients painted on top never quite do. Fixed banner height (not the
// whole scrollable section) with a static camera; the car's position is what moves as this
// banner scrolls through the viewport, not the camera itself.
export function ValleyScene() {
  const bannerRef = useRef<HTMLDivElement>(null);
  const [inView, setInView] = useState(false);

  useEffect(() => {
    const el = bannerRef.current;
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
      ref={bannerRef}
      className="relative left-1/2 h-[60vh] max-h-[560px] min-h-[420px] w-screen -translate-x-1/2 overflow-hidden"
    >
      {inView && (
        <Canvas shadows camera={{ position: [0, 13, 28], fov: 42 }} dpr={[1, 1.75]}>
          <Scene bannerRef={bannerRef} />
        </Canvas>
      )}
      <CompassRose className="absolute right-6 top-6 h-16 w-16 sm:right-10 sm:top-10 sm:h-20 sm:w-20" />
    </div>
  );
}
