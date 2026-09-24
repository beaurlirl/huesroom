"use client";

import { Stats } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Physics, useRapier } from "@react-three/rapier";
import { Suspense, useEffect, useRef } from "react";
import * as THREE from "three";
import { AssetGate } from "./AssetGate";
import { AudioDirector } from "./audio/AudioDirector";
import { bookBodies, Books } from "./Books";
import { CameraRig } from "./CameraRig";
import { Coins } from "./Coins";
import { Hud, useIsTouch } from "./Hud";
import { useTouchInput } from "./input";
import { useHotkeys } from "./input/hotkeys";
import { DebugView } from "./DebugView";
import { Effects } from "./Effects";
import { CAMERA } from "./config";
import { Hue } from "./Hue";
import { Lighting } from "./Lighting";
import { Room, roomColliders } from "./Room";
import { ShareButton, ShareSnapshot } from "./ShareCard";
import { TouchControls } from "./TouchControls";
import { runtime, useGame } from "./store";
import { Overlay } from "./ui/Overlay";

/** Starts the intro once everything has rendered for a couple of frames. */
function SceneReady() {
  const frames = useRef(0);
  useFrame(() => {
    if (useGame.getState().phase !== "loading" || !runtime.hueReady) return;
    // ~0.5 s of physics so the stacked books are at rest before the fade-in.
    if (++frames.current >= 30) useGame.getState().setPhase("intro");
  });
  return null;
}

/** ?debug / ?test: expose the physics world for scripted checks. */
function ExposeWorld() {
  const { world } = useRapier();
  const gl = useThree((s) => s.gl);
  useEffect(() => {
    const w = window as unknown as { __hue?: Record<string, unknown> };
    if (w.__hue) Object.assign(w.__hue, { world, gl });
  }, [world, gl]);
  return null;
}

/** The run timer: starts when the player gets control, stops on the win, pauses with the game. */
function TimerTicker() {
  useFrame((_, dt) => {
    const { phase, paused } = useGame.getState();
    if (phase === "playing" && !paused) runtime.elapsed += Math.min(dt, 0.25);
  });
  return null;
}

export default function Game() {
  const debug = useGame((s) => s.debug);
  const setDebug = useGame((s) => s.setDebug);
  const paused = useGame((s) => s.paused);
  const phase = useGame((s) => s.phase);
  useHotkeys();
  const coarse = useIsTouch();

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const debug = params.has("debug");
    setDebug(debug);
    // ?test exposes the same hooks without the debug visuals (for scripted screenshots).
    if (debug || params.has("test"))
      Object.assign(window, {
        __hue: {
          useGame,
          runtime,
          colliders: roomColliders,
          books: bookBodies,
          touch: useTouchInput,
        },
      });
  }, [setDebug]);

  return (
    <div className="fixed inset-0 bg-white">
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        dpr={coarse ? [1, 1.5] : [1, 2]}
        camera={{
          fov: CAMERA.fov,
          near: CAMERA.near,
          far: 30,
          position: [0, 1, 1.54],
        }}
        gl={{
          antialias: true,
          toneMapping: THREE.ACESFilmicToneMapping,
          outputColorSpace: THREE.SRGBColorSpace,
        }}
      >
        <color attach="background" args={["#ffffff"]} />
        <Suspense fallback={null}>
          <AssetGate>
            <Lighting />
            <Physics
              gravity={[0, -16, 0]}
              timeStep="vary"
              debug={debug}
              paused={paused || phase === "resetting"}
            >
              <Room />
              <Hue />
              <Coins />
              <Books />
            <ExposeWorld />
              <CameraRig />
              {debug && <DebugView />}
            </Physics>
            <SceneReady />
            <TimerTicker />
          <ShareSnapshot />
            <Effects />
          </AssetGate>
        </Suspense>
        {debug && <Stats />}
      </Canvas>
      <AudioDirector />
      <TouchControls />
      <Hud share={<ShareButton />} />
      <Overlay />
    </div>
  );
}
