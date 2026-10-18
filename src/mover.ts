import type * as THREE from "three";
import type { InputSample } from "./input";

/** What Hue.tsx needs from whatever moves him: the walking controller (useHueController.ts) or the skateboard one (skate/SkateMover.ts). */
export interface Mover {
  readonly feet: THREE.Vector3;
  yaw: number;
  readonly mode: string;
  /** Last climb probe, for the ?debug view (the skateboard has none). */
  readonly debugProbe: { active: boolean; from: THREE.Vector3; to: THREE.Vector3; hit: boolean };
  /** Puts him at `feet`, facing `yaw`, standing still. */
  place(feet: THREE.Vector3, yaw: number): void;
  update(dt: number, input: InputSample): void;
  /** The game is paused or between runs: a jump key still held must be let go once before it jumps again. */
  disarmJump(): void;
}
