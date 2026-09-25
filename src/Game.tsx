"use client";

import { PerformanceMonitor, Stats } from "@react-three/drei";
import { Canvas, useFrame, useThree } from "@react-three/fiber";
import { Physics, useRapier } from "@react-three/rapier";
import { Suspense, useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { AssetGate } from "./AssetGate";
import { AudioDirector } from "./audio/AudioDirector";
import { listedClips, loadedClips, musicPlaying } from "./audio/sfx";
import { bookBodies, Books } from "./Books";
import { pushableBodies } from "./pushables";
import { CameraRig } from "./CameraRig";
import { Coins } from "./Coins";
import { Hud, useIsTouch } from "./Hud";
import { useTouchInput } from "./input";
import { GamepadDirector } from "./input/GamepadDirector";
import { useHotkeys } from "./input/hotkeys";
import { DebugView } from "./DebugView";
import { Effects } from "./Effects";
import { CAMERA } from "./config";
import { Hue } from "./Hue";
import { Lighting } from "./Lighting";
import { Room, roomColliders } from "./Room";
import { ShareButton, ShareSnapshot } from "./ShareCard";
import { SprayCans } from "./SprayCans";
import { TouchControls } from "./TouchControls";
import { runtime, useGame } from "./store";
import { ExitScreen } from "./ui/Exit";
import { Overlay } from "./ui/Overlay";
import { theme } from "./ui/theme";

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
  const scene = useThree((s) => s.scene);
  useEffect(() => {
    const w = window as unknown as { __hue?: Record<string, unknown> };
    if (w.__hue) Object.assign(w.__hue, { world, gl, scene });
  }, [world, gl, scene]);
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

function hasWebGL() {
  try {
    const c = document.createElement("canvas");
    return !!(c.getContext("webgl2") ?? c.getContext("webgl"));
  } catch {
    return false;
  }
}

/** Full-screen message for when the game can't draw (no WebGL, or the GPU context was lost). */
function GraphicsMessage({ text, action }: { text: string; action?: { label: string; onClick: () => void } }) {
  return (
    <div
      className="ui fixed inset-0 flex flex-col items-center justify-center gap-4 p-6 text-center"
      style={{ background: theme.paper, color: theme.ink }}
    >
      <div className="text-2xl font-bold">{theme.wordmark}</div>
      <p className="max-w-xs text-sm" style={{ color: theme.muted }}>
        {text}
      </p>
      {action && (
        <button type="button" onClick={action.onClick} className="ui-cta text-sm" style={{ background: theme.blue, color: theme.paper, borderColor: theme.blue }}>
          {action.label}
        </button>
      )}
    </div>
  );
}

export default function Game() {
  const [webgl] = useState(hasWebGL);
  const [contextLost, setContextLost] = useState(false);
  const debug = useGame((s) => s.debug);
  const setDebug = useGame((s) => s.setDebug);
  const paused = useGame((s) => s.paused);
  const phase = useGame((s) => s.phase);
  useHotkeys();
  const coarse = useIsTouch();
  // Adaptive resolution: start at the cap (1.5 on phones, 2 on desktop) and step down if the
  // frame rate can't keep up.
  const maxDpr = coarse ? 1.5 : 2;
  const [dpr, setDpr] = useState(maxDpr);

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
          pushables: pushableBodies,
          touch: useTouchInput,
          audio: { loadedClips, listedClips, musicPlaying },
        },
      });
  }, [setDebug]);

  if (!webgl) return <GraphicsMessage text="This game needs WebGL. Try a recent version of Safari, Chrome or Firefox." />;

  return (
    <div className="fixed inset-0 bg-white">
      <Canvas
        shadows={{ type: THREE.PCFSoftShadowMap }}
        dpr={Math.min(dpr, maxDpr)}
        onCreated={({ gl }) => {
          gl.domElement.addEventListener("webglcontextlost", (e) => {
            e.preventDefault();
            setContextLost(true);
          });
        }}
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
        <PerformanceMonitor
          onDecline={() => setDpr((d) => Math.max(1, d - 0.25))}
          onIncline={() => setDpr((d) => Math.min(maxDpr, d + 0.25))}
          flipflops={3}
          onFallback={() => setDpr(1)}
        />
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
              <SprayCans />
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
      <GamepadDirector />
      <TouchControls />
      <Hud share={<ShareButton />} />
      <Overlay />
      <ExitScreen />
      {/* Drawn over the (still mounted) scene: unmounting physics mid-frame throws in Rapier. */}
      {contextLost && (
        <GraphicsMessage text="The graphics were reset by the device." action={{ label: "Reload", onClick: () => window.location.reload() }} />
      )}
    </div>
  );
}
