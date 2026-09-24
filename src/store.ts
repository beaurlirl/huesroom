import * as THREE from "three";
import { create } from "zustand";

export type Phase =
  | "loading" // assets streaming in
  | "intro" // fade from white, title
  | "ready" // `begin` prompt, waiting for input
  | "rising" // sit_to_stand, input locked
  | "playing"
  | "won";

type GameState = {
  phase: Phase;
  debug: boolean;
  setPhase: (phase: Phase) => void;
  setDebug: (debug: boolean) => void;
};

export const useGame = create<GameState>((set) => ({
  phase: "loading",
  debug: false,
  setPhase: (phase) => set({ phase }),
  setDebug: (debug) => set({ debug }),
}));

/**
 * Per-frame values shared between systems. Mutated in place inside useFrame,
 * never through React state, so nothing re-renders at 60 fps.
 */
export const runtime = {
  /** Hue's feet in world space. */
  feet: new THREE.Vector3(),
  grounded: true,
  /** Camera yaw (radians, 0 = looking toward -Z). Movement is relative to this. */
  cameraYaw: 0,
  cameraPos: new THREE.Vector3(),
  /** Z of the open-wall plane, read from COL_Boundary south. */
  openWallZ: 1.52,
  /** Set once the first clip is bound, playing and evaluated. */
  hueReady: false,
  /** Controller state for ?debug views and scripted tests. */
  debug: {
    mode: "ground" as string,
    probe: null as null | { active: boolean; from: THREE.Vector3; to: THREE.Vector3; hit: boolean },
    teleport: null as null | ((x: number, y: number, z: number, yawDeg?: number) => void),
    /** Scripted input in world directions (x → +X, z → +Z); overrides keys and camera yaw. */
    input: null as null | { x: number; z: number; run: boolean; jump: boolean },
  },
};
