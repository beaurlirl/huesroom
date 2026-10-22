import { create } from "zustand";
import { FlickDetector } from "../skate/flick";
import { getLevel } from "../useLevel";
import { PAD, pollGamepad } from "./gamepad";

export type Trick = "kickflip" | "heelflip" | "shuvit";

/**
 * One merged input sample. moveZ +1 = away from the camera, moveX +1 = right on screen. `pop` and `trick` matter on skateboard levels only: `pop` is an ollie asked for on this sample (the right
 * stick's flick, the up arrow) and `trick` a flip (a flick leaning left or right, the arrows, the pad's X, B and Y).
 */
export type InputSample = { moveX: number; moveZ: number; run: boolean; jump: boolean; pop?: boolean; trick?: Trick };

/** Touch controls write here (milestone 6); keyboard is read directly. `aimX` and `aimY` are the second (right) stick on skateboard levels, +1 = pushed right / up. */
export const useTouchInput = create<{ moveX: number; moveZ: number; run: boolean; jump: boolean; aimX: number; aimY: number }>(() => ({
  moveX: 0,
  moveZ: 0,
  run: false,
  jump: false,
  aimX: 0,
  aimY: 0,
}));

const flick = new FlickDetector();

const down = new Set<string>();
/** On a skateboard level the arrow keys are the right hand's tricks: each fresh press is queued here until the next frame reads it. */
const ARROW_TRICKS: Record<string, "ollie" | Trick> = { ArrowUp: "ollie", ArrowLeft: "kickflip", ArrowRight: "heelflip", ArrowDown: "shuvit" };
const keyTricks: ("ollie" | Trick)[] = [];
let prevPad: boolean[] = [];
let listening = false;

function listen() {
  if (listening || typeof window === "undefined") return;
  listening = true;
  window.addEventListener("keydown", (e) => {
    if (e.metaKey || e.ctrlKey) return;
    down.add(e.code);
    if (!e.repeat && ARROW_TRICKS[e.code]) keyTricks.push(ARROW_TRICKS[e.code]);
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
  const skate = getLevel().mode === "skate";
  // On a skateboard level the arrows are tricks, not movement: W and S push and brake with the left hand.
  const left = skate ? ["KeyA"] : ["KeyA", "ArrowLeft"];
  const right = skate ? ["KeyD"] : ["KeyD", "ArrowRight"];
  const up = skate ? ["KeyW"] : ["KeyW", "ArrowUp"];
  const downKeys = skate ? ["KeyS"] : ["KeyS", "ArrowDown"];
  let moveX = (any(...right) ? 1 : 0) - (any(...left) ? 1 : 0) + touch.moveX + pad.moveX;
  let moveZ = (any(...up) ? 1 : 0) - (any(...downKeys) ? 1 : 0) + touch.moveZ + pad.moveZ;
  const len = Math.hypot(moveX, moveZ);
  if (len > 1) {
    moveX /= len;
    moveZ /= len;
  }
  // The right stick (a phone's second stick, or the pad's): pulled back and pushed forward again in one quick movement is an ollie, leaning to a side as it does a flip.
  const aim = Math.max(-1, Math.min(1, pad.lookY - touch.aimY));
  const flicked = flick.update(aim, performance.now() / 1000, Math.max(-1, Math.min(1, pad.lookX + touch.aimX)));
  let pop = flicked === "ollie";
  let trick: Trick | undefined = flicked === "kickflip" || flicked === "heelflip" ? flicked : undefined;
  const fromKeys = keyTricks.splice(0);
  const edge = (b: number) => !!pad.buttons[b] && !prevPad[b];
  prevPad = pad.buttons;
  if (skate) {
    for (const k of fromKeys) {
      if (k === "ollie") pop = true;
      else trick = k;
    }
    if (edge(PAD.X)) trick = "kickflip";
    if (edge(PAD.B)) trick = "heelflip";
    if (edge(PAD.Y)) trick = "shuvit";
  }
  return {
    moveX,
    moveZ,
    run: any("ShiftLeft", "ShiftRight") || touch.run || pad.run,
    jump: down.has("Space") || touch.jump || pad.jump,
    pop,
    trick,
  };
}

/** Starts listening early so keys held during the rise are already tracked. */
export function initInput() {
  listen();
}
