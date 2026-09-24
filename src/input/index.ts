import { create } from "zustand";

/** One merged input sample. moveZ +1 = away from the camera, moveX +1 = right on screen. */
export type InputSample = { moveX: number; moveZ: number; run: boolean; jump: boolean };

/** Touch controls write here (milestone 6); keyboard is read directly. */
export const useTouchInput = create<{ moveX: number; moveZ: number; run: boolean; jump: boolean }>(() => ({
  moveX: 0,
  moveZ: 0,
  run: false,
  jump: false,
}));

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
  let moveX = (any("KeyD", "ArrowRight") ? 1 : 0) - (any("KeyA", "ArrowLeft") ? 1 : 0) + touch.moveX;
  let moveZ = (any("KeyW", "ArrowUp") ? 1 : 0) - (any("KeyS", "ArrowDown") ? 1 : 0) + touch.moveZ;
  const len = Math.hypot(moveX, moveZ);
  if (len > 1) {
    moveX /= len;
    moveZ /= len;
  }
  return {
    moveX,
    moveZ,
    run: any("ShiftLeft", "ShiftRight") || touch.run,
    jump: down.has("Space") || touch.jump,
  };
}

/** Starts listening early so keys held during the rise are already tracked. */
export function initInput() {
  listen();
}
