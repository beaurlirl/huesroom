import { asset } from "./config";
import type { CAMERA } from "./config";
import type { Par } from "./economy";

/**
 * How a level plays. `run`: timed, with a best time (and, later, medals). `explore`: a relaxed
 * walk-through with no clock, for levels that are more exhibit than obstacle course.
 */
export type LevelMode = "run" | "explore";

/** Per-level camera settings: any of the CAMERA numbers, plus the street-only options below. */
export type LevelCamera = Partial<typeof CAMERA> & {
  /** Two camera planes, one on each side of the street; the camera swings to the other side when Hue crosses the centre line (z = 0). */
  twoSided?: boolean;
  /** Camera x limits when the level isn't symmetric (default: +-xClamp). */
  xMin?: number;
  xMax?: number;
  /** Start low and rise: how far below the normal height the camera begins (m), and how far Hue walks before it has risen. */
  introDrop?: number;
  introDist?: number;
};

/**
 * One level. The room model is the level: its colliders, coins and spawn point are nodes in the
 * glTF (see "Level format" in the README), so a new level is a new model plus an entry below.
 */
export type LevelDef = {
  id: string;
  /** "location 01" on the win card and the share caption. */
  number: number;
  name: string;
  mode: LevelMode;
  /** The room model's URL. */
  room: string;
  /** Node in the room model where Hue starts (its `facing_xy` user data gives the facing). */
  spawn: string;
  /** "chair": he sits at the spawn and stands up when play begins. "stand": he is already on his feet there. */
  start: "chair" | "stand";
  /** The line that ends the level (win panel and share card). */
  winLine: string;
  /** "room": the fixed room lights. "street": the sun follows Hue along the street, on the camera's side. */
  lighting: "room" | "street";
  camera?: LevelCamera;
  /** Speed bonus for `run` levels (see economy.ts). Times are seconds; tune them against real runs. */
  par?: Par;
  /** Nodes flagged `haze` in the model fade to white beyond these x limits, over `span` metres (the blurry ends of a street). */
  haze?: { xMin: number; xMax: number; span: number };
  /** false = not released yet: reachable only with ?level=<id>, never offered as the next level. */
  live: boolean;
};

/** In release order. The first entry is the default and the fallback for an unknown `?level=`. */
export const LEVELS: readonly LevelDef[] = [
  {
    id: "home",
    number: 1,
    name: "home",
    mode: "run",
    room: asset("/room/room.glb"),
    spawn: "SPAWN_Hue_chair",
    start: "chair",
    winLine: "hue made it outside",
    lighting: "room",
    par: { fast: 25, slow: 90, bonusMax: 20 },
    live: true,
  },
  {
    id: "street",
    number: 2,
    name: "ludlow st",
    mode: "run",
    room: asset("/levels/street/room.glb"),
    spawn: "SPAWN_Hue_start",
    start: "stand",
    winLine: "hue made it to the deli",
    lighting: "street",
    camera: {
      twoSided: true,
      xClamp: 16,
      xMin: -14.2,
      xMax: 7.7,
      yMax: 5.6,
      roomDepth: 4.0,
      cornerMinX: 999,
      ladderMinX: 999,
      introDrop: 0.9,
      introDist: 0.9,
    },
    par: { fast: 60, slow: 180, bonusMax: 40 },
    haze: { xMin: -15, xMax: 8.5, span: 5.5 },
    live: false,
  },
];

/** A coin node in a room model. The level's coin total is however many of these it has. */
export const COIN_NODE = /^COIN_\d+$/;

export function levelById(id: string | null | undefined): LevelDef {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}

/** The level offered after this one: the next released entry in release order, or null at the end of the list. */
export function nextLevel(id: string): LevelDef | null {
  const i = LEVELS.findIndex((l) => l.id === id);
  return LEVELS.slice(i + 1).find((l) => l.live) ?? null;
}

/**
 * Where a level's best time is stored. The first level keeps the original key so existing players keep their time;
 * every other level gets its own, so adding a level to LEVELS needs no other storage change.
 */
export function bestKey(id: string): string {
  return id === LEVELS[0].id ? "huesroom.best" : `huesroom.best.${id}`;
}

/** Where the player's coins, bonuses and items are stored on this device (see ledger.ts). */
export const LEDGER_KEY = "huesroom.ledger";
