"use client";

import { Stats } from "@react-three/drei";
import { Canvas, useFrame } from "@react-three/fiber";
import { Physics } from "@react-three/rapier";
import { Suspense, useEffect, useRef } from "react";
import * as THREE from "three";
import { CameraRig } from "./CameraRig";
import { CAMERA } from "./config";
import { Hue } from "./Hue";
import { Lighting } from "./Lighting";
import { Room } from "./Room";
import { runtime, useGame } from "./store";
import { Overlay } from "./ui/Overlay";

/** Starts the intro once everything has rendered for a couple of frames. */
function SceneReady() {
  const frames = useRef(0);
  useFrame(() => {
    if (useGame.getState().phase !== "loading" || !runtime.hueReady) return;
    if (++frames.current >= 3) useGame.getState().setPhase("intro");
  });
  return null;
}

export default function Game() {
  const debug = useGame((s) => s.debug);
  const setDebug = useGame((s) => s.setDebug);

  useEffect(() => {
    const debug = new URLSearchParams(window.location.search).has("debug");
    setDebug(debug);
    if (debug) Object.assign(window, { __hue: { useGame, runtime } });
  }, [setDebug]);

  return (
    <div className="fixed inset-0 bg-white">
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        dpr={[1, 2]}
        camera={{ fov: CAMERA.fov, near: CAMERA.near, far: 30, position: [0, 1, 1.54] }}
        gl={{ antialias: true, toneMapping: THREE.ACESFilmicToneMapping, outputColorSpace: THREE.SRGBColorSpace }}
      >
        <color attach="background" args={["#ffffff"]} />
        <Suspense fallback={null}>
          <Lighting />
          <Physics gravity={[0, -16, 0]} debug={debug}>
            <Room />
            <Hue />
          </Physics>
          <CameraRig />
          <SceneReady />
        </Suspense>
        {debug && <Stats />}
      </Canvas>
      <Overlay />
    </div>
  );
}
