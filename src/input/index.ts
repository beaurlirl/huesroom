import { create } from "zustand";
import { FlickDetector } from "../skate/flick";
import { pollGamepad } from "./gamepad";

/** One merged input sample. moveZ +1 = away from the camera, moveX +1 = right on screen. `pop`: the right stick's flick (an ollie) completed on this sample; it matters on skateboard levels only. */
export type InputSample = { moveX: number; moveZ: number; run: boolean; jump: boolean; pop?: boolean };

/** Touch controls write here (milestone 6); keyboard is read directly. `aimY` is the second (right) stick on skateboard levels, +1 = pushed up. */
export const useTouchInput = create<{ moveX: number; moveZ: number; run: boolean; jump: boolean; aimY: number }>(() => ({
  moveX: 0,
  moveZ: 0,
  run: false,
  jump: false,
  aimY: 0,
}));

const flick = new FlickDetector();

const down = new Set<string>();
let listening = false;

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey) return;
    down.add(e.code);
    if (e.code === "Space" || e.code.startsWith("Arrow")) e.preventDefault();
  });
  window.addEventListener("keyup", (e) => down.delete(e.code));
  window.addEventListener("blur", () => down.clear());
  document.addEventListener("visibilitychange", () => down.clear());
}

const any = (...codes: string[]) => codes.some((c) => down.has(c));

export function readInput(): InputSample {
  listen();
  const touch = useTouchInput.getState();
  const pad = pollGamepad();
  let moveX = (any("KeyD", "ArrowRight") ? 1 : 0) - (any("KeyA", "ArrowLeft") ? 1 : 0) + touch.moveX + pad.moveX;
  let moveZ = (any("KeyW", "ArrowUp") ? 1 : 0) - (any("KeyS", "ArrowDown") ? 1 : 0) + touch.moveZ + pad.moveZ;
  const len = Math.hypot(moveX, moveZ);
  if (len > 1) {
    moveX /= len;
    moveZ /= len;
  }
  // The right stick (a phone's second stick, or the pad's): pulled back and pushed forward again in one quick movement is a pop.
  const aim = Math.max(-1, Math.min(1, pad.lookY - touch.aimY));
  const pop = flick.update(aim, performance.now() / 1000);
  return {
    moveX,
    moveZ,
    run: any("ShiftLeft", "ShiftRight") || touch.run || pad.run,
    jump: down.has("Space") || touch.jump || pad.jump,
    pop,
  };
}

/** Starts listening early so keys held during the rise are already tracked. */
export function initInput() {
  listen();
}
