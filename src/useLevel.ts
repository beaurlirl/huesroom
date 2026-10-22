import { useGLTF } from "@react-three/drei";
import { ASSETS } from "./config";
import { levelById, type LevelDef } from "./levels";
import { skateData } from "./skate/skateLevel";
import { useGame } from "./store";

/** The level being played, outside React (event handlers, module setup). */
export const getLevel = (): LevelDef => levelById(useGame.getState().levelId);

/** The level being played, as a hook. */
export const useLevel = (): LevelDef => levelById(useGame((s) => s.levelId));

/** The current level's room model (suspends until it has loaded). A skateboard level's is read once on the way (its route, rails and generated course: skate/skateLevel.ts). */
export const useRoom = () => {
  const level = useLevel();
  const gltf = useGLTF(level.room, ASSETS.draco);
  if (level.mode === "skate") skateData(gltf.scene, level);
  return gltf;
};

/** Starts downloading the current level's room model. */
export const preloadRoom = () => useGLTF.preload(getLevel().room, ASSETS.draco);
