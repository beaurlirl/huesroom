import * as THREE from "three";

const _a = new THREE.Vector3();

/**
 * The path a skateboard level is ridden along. He rolls forward along it, nothing steers him off it, and the camera follows it from behind. A level without a route has
 * a straight one: from the spawn, in the direction the spawn faces. A level with one (a `SKATE_ROUTE` node, see README > "Skate levels") follows the street's own line, bends and
 * hills included. Distances `s` are metres along the path, measured on the ground plane; a point off either end continues in a straight line.
 */
export class Lane {
  readonly points: THREE.Vector3[];
  /** Horizontal distance from the start to each point. */
  readonly cum: number[];
  readonly length: number;

  constructor(points: readonly THREE.Vector3[]) {
    const pts: THREE.Vector3[] = [];
    for (const p of points) {
      const last = pts[pts.length - 1];
      if (!last || Math.hypot(p.x - last.x, p.z - last.z) > 1e-4) pts.push(p.clone());
    }
    if (pts.length < 2) throw new Error("a skate lane needs at least two distinct points");
    this.points = pts;
    this.cum = [0];
    for (let i = 1; i < pts.length; i++) this.cum.push(this.cum[i - 1] + Math.hypot(pts[i].x - pts[i - 1].x, pts[i].z - pts[i - 1].z));
    this.length = this.cum[this.cum.length - 1];
  }

  /** A straight lane through `from` along the horizontal direction (dx, dz): `behind` metres of it behind `from`, `ahead` metres in front (so `from` is at s = `behind`). */
  static straight(from: THREE.Vector3, dx: number, dz: number, ahead = 10000, behind = 50) {
    const l = Math.hypot(dx, dz) || 1;
    const a = from.clone().add(new THREE.Vector3((-dx / l) * behind, 0, (-dz / l) * behind));
    const b = from.clone().add(new THREE.Vector3((dx / l) * ahead, 0, (dz / l) * ahead));
    return new Lane([a, from, b]);
  }

  /** The segment that holds distance `s` (the first or last one for a distance off either end). */
  private segment(s: number) {
    let lo = 0;
    let hi = this.cum.length - 2;
    while (lo < hi) {
      const mid = (lo + hi + 1) >> 1;
      if (this.cum[mid] <= s) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** The point `s` metres along the path; the height follows the path's own. */
  at(s: number, out = new THREE.Vector3()) {
    const i = this.segment(s);
    const a = this.points[i];
    const b = this.points[i + 1];
    const len = this.cum[i + 1] - this.cum[i];
    return out.lerpVectors(a, b, (s - this.cum[i]) / len);
  }

  /** The unit horizontal direction of the path at `s`, taken across `span` metres either side so it turns smoothly round the vertices. */
  tangent(s: number, out = new THREE.Vector3(), span = 1.5) {
    const a = this.at(s - span, _a);
    this.at(s + span, out);
    out.sub(a);
    out.y = 0;
    const l = out.length();
    return l > 1e-9 ? out.divideScalar(l) : out.set(0, 0, -1);
  }

  /**
   * The distance along the path of the point nearest to (x, z), looking only within `window` metres of `hint` (the whole path when `window` is Infinity). It never
   * jumps to another stretch of the street that happens to pass close by.
   */
  project(x: number, z: number, hint = 0, window = 6) {
    const first = window === Infinity ? 0 : this.segment(hint - window);
    const last = window === Infinity ? this.cum.length - 2 : this.segment(hint + window);
    let best = hint;
    let bestD = Infinity;
    for (let i = first; i <= last; i++) {
      const a = this.points[i];
      const b = this.points[i + 1];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const l2 = dx * dx + dz * dz;
      let t = ((x - a.x) * dx + (z - a.z) * dz) / l2;
      // The first and last segments carry on past their ends.
      if (i !== 0) t = Math.max(0, t);
      if (i !== this.cum.length - 2) t = Math.min(1, t);
      const d = Math.hypot(x - (a.x + dx * t), z - (a.z + dz * t));
      if (d < bestD) {
        bestD = d;
        best = this.cum[i] + t * Math.sqrt(l2);
      }
    }
    return best;
  }
}

/** The points of a `SKATE_ROUTE` node, or null if the model has none: its `route` user data is a list of [x, y, z] in the model's world axes (y up), in riding order. */
export function readRoute(scene: THREE.Object3D, node: string): THREE.Vector3[] | null {
  let found: THREE.Object3D | undefined;
  scene.traverse((o) => {
    if (((o.userData.name as string | undefined) ?? o.name) === node) found = o;
  });
  const pts = found?.userData.route as [number, number, number][] | undefined;
  if (!pts || pts.length < 2) return null;
  found!.visible = false;
  return pts.map(([x, y, z]) => new THREE.Vector3(x, y, z));
}
