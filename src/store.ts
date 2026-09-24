import * as THREE from "three";
import { create } from "zustand";

export type Phase =
  | "loading" // assets streaming in
  | "intro" // fade from white, title
  | "ready" // `begin` prompt, waiting for input
  | "rising" // sit_to_stand, input locked
  | "playing"
  | "won"
  | "resetting"; // fading to white before a restart

export const COIN_COUNT = 11;
export const RESET_FADE_MS = 450;
const BEST_KEY = "huesroom.best";

export function readBest(): number | null {
  try {
    const v = window.localStorage.getItem(BEST_KEY);
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function writeBest(t: number) {
  try {
    window.localStorage.setItem(BEST_KEY, String(t));
  } catch {
    // Storage blocked (private mode, etc.): the game works without it.
  }
}

type GameState = {
  phase: Phase;
  debug: boolean;
  paused: boolean;
  /** Bumped on every restart; systems reset themselves when it changes. */
  runId: number;
  collected: number;
  /** Final time of the last win, and the best time after it. */
  result: { time: number; best: number; isBest: boolean } | null;
  setPhase: (phase: Phase) => void;
  setDebug: (debug: boolean) => void;
  setPaused: (paused: boolean) => void;
  collect: () => void;
  restart: () => void;
};

export const useGame = create<GameState>((set, get) => ({
  phase: "loading",
  debug: false,
  paused: false,
  runId: 0,
  collected: 0,
  result: null,
  setPhase: (phase) => set({ phase }),
  setDebug: (debug) => set({ debug }),
  setPaused: (paused) => set({ paused: paused && get().phase === "playing" }),
  collect: () => {
    const { collected, phase } = get();
    if (phase !== "playing") return;
    const next = collected + 1;
    if (next < COIN_COUNT) return set({ collected: next });
    const time = runtime.elapsed;
    const prev = readBest();
    const isBest = prev === null || time < prev;
    if (isBest) writeBest(time);
    set({ collected: next, phase: "won", result: { time, best: isBest ? time : prev, isBest } });
  },
  restart: () => {
    const { phase } = get();
    if (phase === "loading" || phase === "resetting") return;
    set({ phase: "resetting", paused: false });
    // Fade to white, reset everything behind it, then replay the intro.
    setTimeout(() => {
      runtime.elapsed = 0;
      set((s) => ({ runId: s.runId + 1, collected: 0, result: null, phase: "intro" }));
    }, RESET_FADE_MS);
  },
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
  /** Run time in seconds (counts only while playing and not paused). */
  elapsed: 0,
  /** Controller state for ?debug views and scripted tests. */
  debug: {
    mode: "ground" as string,
    probe: null as null | { active: boolean; from: THREE.Vector3; to: THREE.Vector3; hit: boolean },
    teleport: null as null | ((x: number, y: number, z: number, yawDeg?: number) => void),
    /** Scripted input in world directions (x → +X, z → +Z); overrides keys and camera yaw. */
    input: null as null | { x: number; z: number; run: boolean; jump: boolean },
  },
};

/** Whether the simulation should advance this frame. */
export function isRunning() {
  const { phase, paused } = useGame.getState();
  return !paused && phase !== "resetting";
}

/** 0:42.3 */
export function formatTime(t: number) {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  return `${m}:${s.toFixed(1).padStart(4, "0")}`;
}
