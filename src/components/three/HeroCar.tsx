"use client";

import { Suspense, useRef } from "react";
import { Canvas, useFrame } from "@react-three/fiber";
import { Float, useGLTF } from "@react-three/drei";
import { PCFShadowMap, type Group } from "three";

const CAR_MODEL = "/models/car/scene.gltf";
const TRACK_MODEL = "/models/track/scene.gltf";

function CarModel() {
  const { scene } = useGLTF(CAR_MODEL);
  const group = useRef<Group>(null);

  useFrame((_state, delta) => {
    if (group.current) group.current.rotation.y += delta * 0.35;
  });

  // Camera looks at the origin (r3f's implicit lookAt(0,0,0) when no rotation is passed), so this
  // position sits toward the right of frame, pulled down from center, while staying on the same
  // depth plane as the origin.
  return (
    <group ref={group} scale={0.085} position={[1.75, 0.65, -1.94]}>
      <primitive object={scene} />
    </group>
  );
}

function TrackModel() {
  const { scene } = useGLTF(TRACK_MODEL);
  return (
    <group scale={0.32} position={[0, -0.55, 0]}>
      <primitive object={scene} />
    </group>
  );
}

export function HeroCar() {
  return (
    <Canvas
      // r3f's `shadows` boolean defaults to THREE.PCFSoftShadowMap, deprecated as of three
      // 0.185 in favor of PCFShadowMap — request that directly instead.
      shadows={{ enabled: true, type: PCFShadowMap }}
      camera={{ position: [4.2, 2.4, 4.6], fov: 38 }}
      dpr={[1, 1.75]}
      className="!absolute inset-0"
    >
      <color attach="background" args={["#0a0a0c"]} />
      <ambientLight intensity={0.35} />
      <spotLight position={[5, 6, 5]} angle={0.35} penumbra={0.6} intensity={220} color="#ff5b52" castShadow />
      <directionalLight position={[-4, 3, -2]} intensity={0.6} color="#8fb4ff" />
      <Suspense fallback={null}>
        <TrackModel />
        <Float speed={1.4} rotationIntensity={0.15} floatIntensity={0.4}>
          <CarModel />
        </Float>
      </Suspense>
    </Canvas>
  );
}

useGLTF.preload(CAR_MODEL);
useGLTF.preload(TRACK_MODEL);
