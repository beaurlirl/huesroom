import { useGLTF } from "@react-three/drei";
import { ASSETS } from "./config";
import { levelById, type LevelDef } from "./levels";
import { useGame } from "./store";

/** The level being played, outside React (event handlers, module setup). */
export const getLevel = (): LevelDef => levelById(useGame.getState().levelId);

/** The level being played, as a hook. */
export const useLevel = (): LevelDef => levelById(useGame((s) => s.levelId));

/** The current level's room model (suspends until it has loaded). */
export const useRoom = () => useGLTF(useLevel().room, ASSETS.draco);

/** Starts downloading the current level's room model. */
export const preloadRoom = () => useGLTF.preload(getLevel().room, ASSETS.draco);
