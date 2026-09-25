import type { RapierRigidBody } from "@react-three/rapier";

/** Every loose prop Hue can shove or kick (books, spray cans). Read by the character controller. */
export const pushableBodies = new Set<RapierRigidBody>();

/** Props made dynamic at runtime: their COL_* boxes must not also become fixed colliders. */
export const DYNAMIC_PROP_PREFIXES = ["COL_Spray can"];
