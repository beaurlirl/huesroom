import { asset } from "./config";

/**
 * How a level plays. `run`: timed, with a best time (and, later, medals). `explore`: a relaxed
 * walk-through with no clock, for levels that are more exhibit than obstacle course.
 */
export type LevelMode = "run" | "explore";

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
};

/** In release order. The first entry is the default and the fallback for an unknown `?level=`. */
export const LEVELS: readonly LevelDef[] = [
  { id: "home", number: 1, name: "home", mode: "run", room: asset("/room/room.glb"), spawn: "SPAWN_Hue_chair" },
];

/** A coin node in a room model. The level's coin total is however many of these it has. */
export const COIN_NODE = /^COIN_\d+$/;

export function levelById(id: string | null | undefined): LevelDef {
  return LEVELS.find((l) => l.id === id) ?? LEVELS[0];
}
