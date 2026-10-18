import * as THREE from "three";
import { create } from "zustand";
import type { Reward } from "./economy";
import type { Lane } from "./skate/lane";
import { OUTRO } from "./config";
import { applyRun, EMPTY_LEDGER, parseLedger, walletOf, type Ledger } from "./ledger";
import { bestKey, LEDGER_KEY, LEVELS, levelById } from "./levels";

export type Phase =
  | "loading" // assets streaming in
  | "intro" // fade from white, title
  | "ready" // `begin` prompt, waiting for input
  | "rising" // sit_to_stand, input locked
  | "playing"
  | "won"
  | "resetting"; // fading to white before a restart

/** `?level=<id>` picks the level (dev and tests); anything else plays the first. */
function initialLevelId() {
  if (typeof window === "undefined") return LEVELS[0].id;
  return levelById(new URLSearchParams(window.location.search).get("level")).id;
}
/** Restart: the room fogs over to white glass before it resets behind it. */
export const RESET_FADE_MS = 650;

export function readBest(levelId: string = useGame.getState().levelId): number | null {
  try {
    const v = window.localStorage.getItem(bestKey(levelId));
    return v ? Number(v) : null;
  } catch {
    return null;
  }
}

function writeBest(levelId: string, t: number) {
  try {
    window.localStorage.setItem(bestKey(levelId), String(t));
  } catch {
    // Storage blocked (private mode, etc.): the game works without it.
  }
}

export function readLedger(): Ledger {
  try {
    return parseLedger(JSON.parse(window.localStorage.getItem(LEDGER_KEY) ?? "null"));
  } catch {
    return EMPTY_LEDGER;
  }
}

function writeLedger(l: Ledger) {
  try {
    window.localStorage.setItem(LEDGER_KEY, JSON.stringify(l));
  } catch {
    // Storage blocked: the run still shows what it earned, it just isn't kept.
  }
}

/** Pays a finished run into the ledger on this device. */
function bankRun(levelId: string, time: number, coins: number): { reward: Reward; wallet: number } {
  const par = levelById(levelId).par;
  if (!par) return { reward: { base: 0, bonus: 0, total: 0 }, wallet: walletOf(readLedger()) };
  const { ledger, reward } = applyRun(readLedger(), levelId, time, coins, par);
  writeLedger(ledger);
  return { reward, wallet: walletOf(ledger) };
}

/** Ends the run as a win: the best time, and the coins and speed bonus paid into this device's ledger. */
function winPatch(levelId: string, coins: number) {
  const time = runtime.elapsed;
  const prev = readBest(levelId);
  const isBest = prev === null || time < prev;
  if (isBest) writeBest(levelId, time);
  const { reward, wallet } = bankRun(levelId, time, coins);
  return { phase: "won" as const, wonAt: performance.now(), result: { time, best: isBest ? time : prev, isBest, reward, wallet } };
}

type GameState = {
  phase: Phase;
  debug: boolean;
  paused: boolean;
  /** Bumped on every restart; systems reset themselves when it changes. */
  runId: number;
  /** Which level is loaded (an id from LEVELS). */
  levelId: string;
  collected: number;
  /** The coins collected this run, by node name (a door can wait for one: `open_after`). */
  collectedNames: string[];
  /** Coins in this level: counted from the room model once it has loaded. */
  totalCoins: number;
  /** Everything is loaded and the scene has settled; the title card can clear. */
  sceneReady: boolean;
  /** Back to the home menu: the room fogs over to white, then the page reloads on the plain address (which opens the menu, and nothing of a level). */
  goToMenu: () => void;
  /** A line to show over the game for as long as it is true (a locked coin's reason), or null. */
  hint: string | null;
  /** When the run was won (performance.now), so the jump and confirm keys can wait for the results before they mean "play again". */
  wonAt: number;
  /** Final time of the last win, and the best time after it. */
  result: { time: number; best: number; isBest: boolean; reward: Reward; wallet: number } | null;
  setPhase: (phase: Phase) => void;
  setHint: (hint: string | null) => void;
  setTotalCoins: (n: number) => void;
  setDebug: (debug: boolean) => void;
  setPaused: (paused: boolean) => void;
  collect: (name?: string) => void;
  /** A skateboard run ends at its finish line, whatever coins were picked up on the way. */
  finishRun: () => void;
  restart: () => void;
  /** Plays another level: the room fogs over to white, then the page reloads on `?level=<id>` so nothing of the old level carries over. */
  goToLevel: (id: string) => void;
};

export const useGame = create<GameState>((set, get) => ({
  phase: "loading",
  debug: false,
  paused: false,
  runId: 0,
  levelId: initialLevelId(),
  collected: 0,
  collectedNames: [],
  totalCoins: 0,
  sceneReady: false,
  result: null,
  wonAt: 0,
  hint: null,
  goToMenu: () => {
    const { phase, sceneReady } = get();
    if (phase === "loading" || phase === "resetting" || !sceneReady) return;
    set({ phase: "resetting", paused: false });
    setTimeout(() => {
      const url = new URL(window.location.href);
      url.search = "";
      window.location.assign(url.toString());
    }, RESET_FADE_MS);
  },
  setPhase: (phase) => set({ phase }),
  setHint: (hint) => set({ hint }),
  setTotalCoins: (totalCoins) => set({ totalCoins }),
  setDebug: (debug) => set({ debug }),
  setPaused: (paused) => set({ paused: paused && get().phase === "playing" }),
  collect: (name) => {
    const { collected, phase, totalCoins, levelId, collectedNames } = get();
    if (phase !== "playing" || totalCoins === 0) return;
    const next = collected + 1;
    const names = name ? [...collectedNames, name] : collectedNames;
    // A skateboard level's coins are picked up on the way (over obstacles, along rails); the run ends at the finish line (finishRun).
    if (levelById(levelId).mode === "skate" || next < totalCoins) return set({ collected: next, collectedNames: names });
    set({ collected: next, collectedNames: names, ...winPatch(levelId, totalCoins) });
  },
  finishRun: () => {
    const { phase, levelId, collected } = get();
    if (phase !== "playing") return;
    set(winPatch(levelId, collected));
  },
  restart: () => {
    const { phase, sceneReady } = get();
    if (phase === "loading" || phase === "resetting" || !sceneReady) return;
    set({ phase: "resetting", paused: false });
    // Fog over to white, reset everything behind it, then replay the intro.
    setTimeout(() => {
      runtime.elapsed = 0;
      set((s) => ({ runId: s.runId + 1, collected: 0, collectedNames: [], result: null, phase: "intro" }));
    }, RESET_FADE_MS);
  },
  goToLevel: (id) => {
    const { phase, sceneReady } = get();
    if (phase === "loading" || phase === "resetting" || !sceneReady) return;
    const target = levelById(id).id;
    set({ phase: "resetting", paused: false });
    // A fresh load per level: physics, caches and per-run state all start clean, whatever the level.
    setTimeout(() => {
      const url = new URL(window.location.href);
      url.searchParams.set("level", target);
      window.location.assign(url.toString());
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
  /** Mid ledge climb: the camera follows vertically with less lag. */
  climbing: false,
  /** Camera yaw (radians, 0 = looking toward -Z). */
  cameraYaw: 0,
  /** The yaw the controls are relative to. It follows the camera, except that a direction held through a camera flip keeps its meaning. */
  moveYaw: 0,
  /** Hue is being steered right now (set by the controller). */
  steering: false,
  /** Which way the stick (or the keys) is pushed, before the camera turns it into a heading: 0 = away from the camera, +90° = right on screen. */
  stickAngle: 0,
  /** Two-sided streets: which side the camera is on (+1 / -1) and how far through the swing between them (0..1, eased). */
  camSide: 1 as 1 | -1,
  camFlip: 0,
  /** Where this run started (feet): the camera's intro rise is measured from it. */
  startFeet: new THREE.Vector3(),
  cameraPos: new THREE.Vector3(),
  /** Z of the open-wall plane, read from COL_Boundary south. */
  openWallZ: 1.52,
  /** The name of the model piece the camera is hiding right now (levels.ts shot `cutaway`), or null. */
  cutaway: null as string | null,
  /** Set once the first clip is bound, playing and evaluated. */
  hueReady: false,
  /** Run time in seconds (counts only while playing and not paused). */
  elapsed: 0,
  /** Skateboard levels: the board's state, for the camera, the board's drawing and the tests. */
  skate: {
    active: false,
    /** The path he rides (skate/lane.ts), how far along it he is (m), his speed along it (m/s) and its unit direction there (the way he rolls). */
    lane: null as Lane | null,
    s: 0,
    speed: 0,
    dir: new THREE.Vector3(1, 0, 0),
    /** The board's heading (radians, the same turn as Hue's yaw). */
    heading: 0,
    grinding: false,
    railName: null as string | null,
    /** Nose-up tilt (radians) and wheel turns, for the drawing. */
    pitch: 0,
    wheel: 0,
    /** Counted for the tests: pops (ollies), grinds started, bumps into something tall. */
    pops: 0,
    grinds: 0,
    bumps: 0,
    /** The model piece the last bump was with. */
    bumpedInto: null as string | null,
  },
  /** Controller state for ?debug views and scripted tests. */
  debug: {
    mode: "ground" as string,
    probe: null as null | { active: boolean; from: THREE.Vector3; to: THREE.Vector3; hit: boolean },
    teleport: null as null | ((x: number, y: number, z: number, yawDeg?: number) => void),
    /** (tests) How far his drawn body is moved at a spot to stand on the drawn top there (levels.ts `snapFeet`). */
    feetLift: null as null | ((x: number, y: number, z: number) => number),
    surface: null as null | { lost: number; buildMs: number; ready: boolean },
    /** (tests, skateboard levels) Roll at this speed (m/s) at once. */
    skateSpeed: null as null | ((v: number) => void),
    /** Scripted input in world directions (x → +X, z → +Z); overrides keys and camera yaw. */
    input: null as null | { x: number; z: number; run: boolean; jump: boolean; pop?: boolean },
  },
};

/** The win screen is showing its results: only then do Space / Enter / the pad's A play again (they are also the jump keys, so a player still jumping when the last coin lands would skip it). */
export function winConfirmReady() {
  const { phase, wonAt } = useGame.getState();
  return phase === "won" && performance.now() - wonAt >= OUTRO.confirmAfter * 1000;
}

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
