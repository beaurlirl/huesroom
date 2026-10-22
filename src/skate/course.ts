import * as THREE from "three";
import { SKATE } from "../config";
import type { Lane } from "./lane";
import type { Rail } from "./rails";

/**
 * The gameplay laid along a skateboard street whose model is only a street (levels.ts `skate.course`): low obstacles to ollie, grind rails, kickers, and the coins over all of them,
 * placed along the route from a seed, the same every time. The numbers are the README's "Skate levels" rules (what he steps over, how high an ollie goes, where a coin is out of reach
 * from the ground), so a course can always be ridden. Pure: it makes data (boxes, rails, coins in world space); skateLevel.ts puts them into the scene.
 */
export type CourseOptions = {
  seed: number;
  /** Where the first piece may be, and how close to the end the last may be (m along the route). */
  start: number;
  end: number;
  /** Distance between pieces (m): the least, and how much more at most. */
  gap: [number, number];
};

export type CourseBox = {
  name: string;
  /** Centre, orientation (local +x along the route) and full size (x along the route, y up, z across). */
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  size: THREE.Vector3;
  color: string;
  /** Solid to him (a collider), and drawn. A rail's ledge is both; its hidden stops are neither drawn nor solid. */
  collide: boolean;
  render: boolean;
};

export type CoursePiece = { kind: "kerb" | "barrier" | "doubleKerb" | "rail" | "kicker" | "trail"; s: number; sEnd: number; boxes: CourseBox[]; rails: Rail[]; coins: THREE.Vector3[] };

export type Course = { pieces: CoursePiece[]; boxes: CourseBox[]; rails: Rail[]; coins: THREE.Vector3[] };

/** A small seeded random generator (mulberry32): the same seed, the same course, on every device. */
export function rng(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const COLOURS = { concrete: "#b9b6ad", kerb: "#e0c15a", barrier: "#e0742f", ramp: "#c6a06a", rail: "#9aa0a8", post: "#6e737a", ledge: "#a8a69d" };
const UP = new THREE.Vector3(0, 1, 0);
const REACH = 0.58; // a coin centred this high or higher is out of reach from the ground (README > Skate levels)

/** Arc of coins over an obstacle: wider than it by 0.3 m, REACH up at the ends and 0.16 m higher in the middle, every 0.2 m. */
function arc(lane: Lane, s: number, length: number, top: number, out: THREE.Vector3[]) {
  const n = Math.max(5, Math.ceil((length + 0.3) / 0.2) | 1);
  for (let i = 0; i < n; i++) {
    const t = (i - (n - 1) / 2) / ((n - 1) / 2);
    const p = lane.at(s + (i - (n - 1) / 2) * 0.2);
    p.y += Math.max(REACH, top + 0.45) + 0.16 * (1 - t * t);
    out.push(p);
  }
}

export function generateCourse(lane: Lane, opts: CourseOptions): Course {
  const rand = rng(opts.seed);
  const pieces: CoursePiece[] = [];
  const heading = new THREE.Vector3();
  const frame = (s: number) => {
    lane.tangent(s, heading);
    const yaw = Math.atan2(-heading.z, heading.x); // local +x along the route
    return new THREE.Quaternion().setFromAxisAngle(UP, yaw);
  };
  const box = (name: string, s: number, lift: number, size: [number, number, number], color: string, collide = true, render = true, tilt = 0): CourseBox => {
    const p = lane.at(s);
    const q = frame(s);
    if (tilt) q.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), tilt));
    return { name, pos: new THREE.Vector3(p.x, p.y + lift, p.z), quat: q, size: new THREE.Vector3(...size), color, collide, render };
  };

  // The beats, in a shuffled order that never repeats a kind twice in a row.
  const kinds: CoursePiece["kind"][] = ["kerb", "rail", "kicker", "barrier", "trail", "doubleKerb", "rail", "kerb"];
  let last: string | null = null;
  let s = opts.start;
  let n = 0;
  while (s < opts.end) {
    let kind: CoursePiece["kind"];
    do kind = kinds[Math.floor(rand() * kinds.length)];
    while (kind === last);
    last = kind;
    n++;
    const id = `Course ${n} ${kind}`;
    const coins: THREE.Vector3[] = [];
    const boxes: CourseBox[] = [];
    const rails: Rail[] = [];
    let len = 1;
    switch (kind) {
      case "kerb":
      case "barrier": {
        // 0.15 to 0.18 m is a kerb (over the 0.12 m he rolls up), 0.20 to 0.22 m a barrier that needs a good pop.
        const h = kind === "kerb" ? 0.15 + rand() * 0.03 : 0.2 + rand() * 0.02;
        len = 0.4 + rand() * 0.2;
        boxes.push(box(id, s + len / 2, h / 2, [len, h, 1.6], kind === "kerb" ? COLOURS.kerb : COLOURS.barrier));
        arc(lane, s + len / 2, len, h, coins);
        break;
      }
      case "doubleKerb": {
        const h = 0.15;
        len = 1.2;
        boxes.push(box(`${id} a`, s + 0.15, h / 2, [0.3, h, 1.6], COLOURS.kerb), box(`${id} b`, s + 1.05, h / 2, [0.3, h, 1.6], COLOURS.kerb));
        arc(lane, s + len / 2, len, h, coins);
        break;
      }
      case "rail": {
        len = 1.2 + rand() * 1.0;
        const top = 0.2 + rand() * 0.06;
        const a = lane.at(s);
        const b = lane.at(s + len);
        a.y += top;
        b.y += top;
        const dir = new THREE.Vector3().subVectors(b, a);
        rails.push({ name: id, a, b, dir: dir.clone().normalize(), length: dir.length() });
        const mid = s + len / 2;
        const slope = Math.atan2(b.y - a.y, len);
        // The pipe, its posts, and the ledge under it that he bumps into on the ground (its top is 3 cm under the grind line, so a landing on it is caught by the rail).
        boxes.push(box(`${id} pipe`, mid, top - 0.012, [len, 0.024, 0.03], COLOURS.rail, false, true, slope));
        for (const ps of [s + 0.06, s + len - 0.06]) boxes.push(box(`${id} post`, ps, (top - 0.024) / 2, [0.03, top - 0.024, 0.03], COLOURS.post, false, true));
        boxes.push(box(`${id} ledge`, mid, (top - 0.03) / 2, [len, top - 0.03, 0.05], COLOURS.ledge, true, false));
        const coinsN = Math.max(3, Math.floor((len - 0.2) / 0.25) + 1);
        for (let i = 0; i < coinsN; i++) {
          const p = lane.at(mid + (i - (coinsN - 1) / 2) * 0.25);
          p.y += top + 0.47;
          coins.push(p);
        }
        break;
      }
      case "kicker": {
        // A ramp 0.6 m long rising 0.3 m, a lip, and coins along the flight that follows (at 2 m/s).
        const run = 0.6;
        const h = 0.3;
        len = run + 1.0;
        const ang = Math.atan2(h, run);
        const slopeLen = Math.hypot(run, h);
        const thick = 0.06;
        // The slab's top surface runs from the ground at `s` to the lip at `s + run`; its centre sits half a thickness under the surface's midpoint.
        const mid = lane.at(s + run / 2);
        const qf = frame(s + run / 2);
        const q = qf.clone().multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(0, 0, 1), ang));
        const nrm = new THREE.Vector3(-Math.sin(ang), Math.cos(ang), 0).applyQuaternion(qf);
        boxes.push({ name: `${id} ramp`, pos: mid.clone().add(new THREE.Vector3(0, h / 2, 0)).addScaledVector(nrm, -thick / 2), quat: q, size: new THREE.Vector3(slopeLen, thick, 1.4), color: COLOURS.ramp, collide: true, render: true });
        // The slab alone leaves an open back to the eye; a lip board closes it.
        boxes.push(box(`${id} lip`, s + run - 0.02, h / 2 - 0.02, [0.04, h - 0.04, 1.4], COLOURS.ramp, false, true));
        const vy = (h / run) * 2.0;
        for (let i = 1; i <= 5; i++) {
          const t = (i * 0.2) / 2.0;
          const p = lane.at(s + run + i * 0.2);
          p.y += h + vy * t - 0.5 * SKATE.gravity * t * t + 0.38;
          coins.push(p);
        }
        break;
      }
      case "trail": {
        // A few coins on the ground to push toward: a breather between the harder pieces.
        len = 2;
        for (let i = 0; i < 5; i++) {
          const p = lane.at(s + 0.2 + i * 0.4);
          p.y += 0.2;
          coins.push(p);
        }
        break;
      }
    }
    pieces.push({ kind, s, sEnd: s + len, boxes, rails, coins });
    s += len + opts.gap[0] + rand() * opts.gap[1];
  }
  return { pieces, boxes: pieces.flatMap((p) => p.boxes), rails: pieces.flatMap((p) => p.rails), coins: pieces.flatMap((p) => p.coins) };
}
