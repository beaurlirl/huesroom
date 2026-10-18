import * as THREE from "three";
import { SKATE } from "../config";

/**
 * Grind rails. A `RAIL_01`, `RAIL_02`, … node in a skate level's model is a box (hidden in the game, like a `COL_*` box) whose long side is the rail and whose top face
 * is the line Hue grinds along; the visible rail is ordinary model geometry next to it. A rail has no collider: it only catches the feet of a board that lands on it.
 */
export const RAIL_NODE = /^RAIL_\d+$/;

export type Rail = {
  name: string;
  /** The ends of the grind line, `a` the lower x (or z) one. */
  a: THREE.Vector3;
  b: THREE.Vector3;
  /** Unit vector from a to b. */
  dir: THREE.Vector3;
  length: number;
};

type BoxLike = { center: THREE.Vector3; halfExtents: THREE.Vector3; quaternion: THREE.Quaternion };

const _x = new THREE.Vector3(1, 0, 0);
const _y = new THREE.Vector3(0, 1, 0);
const _z = new THREE.Vector3(0, 0, 1);

/** The grind line of an oriented box: along its longest side, over the middle of its top face. */
export function railFromBox(name: string, box: BoxLike): Rail {
  const axes = [_x, _y, _z].map((a) => a.clone().applyQuaternion(box.quaternion));
  const half = [box.halfExtents.x, box.halfExtents.y, box.halfExtents.z];
  let long = 0;
  for (let i = 1; i < 3; i++) if (half[i] > half[long]) long = i;
  // Of the other two sides, the one that stands most upright is the box's thickness: the grind line is on its upper face.
  const others = [0, 1, 2].filter((i) => i !== long);
  const up = Math.abs(axes[others[0]].y) >= Math.abs(axes[others[1]].y) ? others[0] : others[1];
  const top = axes[up].clone().multiplyScalar(Math.sign(axes[up].y || 1) * half[up]);
  const centre = box.center.clone().add(top);
  const dir = axes[long].clone().normalize();
  if (dir.x < -1e-6 || (Math.abs(dir.x) <= 1e-6 && dir.z < 0)) dir.negate();
  const a = centre.clone().addScaledVector(dir, -half[long]);
  const b = centre.clone().addScaledVector(dir, half[long]);
  return { name, a, b, dir, length: 2 * half[long] };
}

/** Every `RAIL_nn` node in a loaded room model, hidden, as grind lines. */
export function readRails(scene: THREE.Object3D): Rail[] {
  scene.updateMatrixWorld(true);
  const out: Rail[] = [];
  scene.traverse((obj) => {
    const name = (obj.userData.name as string | undefined) ?? obj.name;
    if (!RAIL_NODE.test(name)) return;
    obj.visible = false;
    const mesh = obj as THREE.Mesh;
    if (!mesh.isMesh) return;
    mesh.geometry.computeBoundingBox();
    const bb = mesh.geometry.boundingBox!;
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    mesh.matrixWorld.decompose(new THREE.Vector3(), quaternion, scale);
    const center = bb.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
    const halfExtents = bb.getSize(new THREE.Vector3()).multiply(scale).multiplyScalar(0.5);
    out.push(railFromBox(name, { center, halfExtents, quaternion }));
  });
  return out.sort((p, q) => p.name.localeCompare(q.name));
}

/** The point `s` metres along a rail (clamped to its ends). */
export function railPoint(rail: Rail, s: number, out = new THREE.Vector3()) {
  return out.copy(rail.a).addScaledVector(rail.dir, THREE.MathUtils.clamp(s, 0, rail.length));
}

export type RailHit = { rail: Rail; s: number };

const _d = new THREE.Vector3();

/**
 * Does a board whose feet are at `p`, moving up at `vy`, land on a rail? The feet must be over the rail's length (a hair past each end), within `catchWidth` of its line
 * sideways, between `below` under and `above` over it, and not rising fast. The nearest rail by height wins. `skip` is the rail he has just left.
 */
export function catchRail(rails: readonly Rail[], p: THREE.Vector3, vy: number, skip: Rail | null = null): RailHit | null {
  const R = SKATE.rail;
  if (vy > R.maxRise) return null;
  let best: RailHit | null = null;
  let bestDy = Infinity;
  for (const rail of rails) {
    if (rail === skip) continue;
    _d.subVectors(p, rail.a);
    const s = _d.dot(rail.dir);
    if (s < -R.endMargin || s > rail.length + R.endMargin) continue;
    const c = railPoint(rail, s);
    // Sideways = horizontal distance from the rail's own vertical plane.
    const hx = rail.dir.x;
    const hz = rail.dir.z;
    const hl = Math.hypot(hx, hz) || 1;
    const side = Math.abs(((p.x - c.x) * -hz + (p.z - c.z) * hx) / hl);
    if (side > R.catchWidth) continue;
    const dy = p.y - c.y;
    if (dy < -R.below || dy > R.above) continue;
    if (Math.abs(dy) < bestDy) {
      bestDy = Math.abs(dy);
      best = { rail, s: THREE.MathUtils.clamp(s, 0, rail.length) };
    }
  }
  return best;
}
