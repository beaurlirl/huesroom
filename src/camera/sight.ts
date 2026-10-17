import * as THREE from "three";

/**
 * A coarse map of what is solid in a level, so the camera can tell whether it can see Hue (levels.ts `camera.sight`).
 *
 * The room's solid meshes are rasterised into a grid of small cells once the level has loaded (in slices of a few milliseconds, so nothing hitches). A line from the camera to Hue
 * then walks the grid cell by cell: microseconds, and exact enough that "this cell is solid" is never wrong the dangerous way (a thin shelf wire fills its whole 5 cm cell, so the camera
 * keeps out of the way of racks rather than peering through them). Meshes that move (doors, kicked props), glass, and Hue himself are not in it.
 *
 * Cells hold bit 1 = solid, bit 2 = solid unless the current shot has cut that piece away (a node flagged `cutaway` in the model, hidden while a shot looks across it).
 */
export const SOLID = 1;
export const CUTAWAY = 2;

type Job = { geo: THREE.BufferGeometry; m: Float32Array; bit: number };

export class SightGrid {
  readonly nx: number;
  readonly ny: number;
  readonly nz: number;
  readonly data: Uint8Array;
  /** All queued meshes have been rasterised. */
  ready = false;
  /** Milliseconds spent rasterising so far (for tests and tuning). */
  buildMs = 0;
  private jobs: Job[] = [];
  private job = 0;
  private tri = 0;
  private stack = new Float64Array(9 * 96);

  constructor(
    readonly ox: number,
    readonly oy: number,
    readonly oz: number,
    readonly cell: number,
    sizeX: number,
    sizeY: number,
    sizeZ: number,
  ) {
    this.nx = Math.ceil(sizeX / cell);
    this.ny = Math.ceil(sizeY / cell);
    this.nz = Math.ceil(sizeZ / cell);
    this.data = new Uint8Array(this.nx * this.ny * this.nz);
  }

  /** Queues every mesh under `root` that `classify` gives a bit (0 = leave out). Call `step` until it returns true. */
  add(root: THREE.Object3D, classify: (mesh: THREE.Mesh) => number) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry.attributes.position) return;
      const bit = classify(mesh);
      if (bit) this.jobs.push({ geo: mesh.geometry, m: Float32Array.from(mesh.matrixWorld.elements), bit });
    });
    this.ready = this.jobs.length === 0;
  }

  /** Rasterises for up to `ms` milliseconds. True when everything is done. */
  step(ms: number): boolean {
    if (this.ready) return true;
    const t0 = performance.now();
    let n = 0;
    while (this.job < this.jobs.length) {
      const { geo, m, bit } = this.jobs[this.job];
      const pos = geo.attributes.position;
      const idx = geo.index;
      const count = idx ? idx.count : pos.count;
      while (this.tri * 3 < count) {
        const i0 = this.tri * 3;
        const a = idx ? idx.getX(i0) : i0;
        const b = idx ? idx.getX(i0 + 1) : i0 + 1;
        const c = idx ? idx.getX(i0 + 2) : i0 + 2;
        this.markTriangle(pos, a, b, c, m, bit);
        this.tri++;
        if ((++n & 255) === 0 && performance.now() - t0 > ms) {
          this.buildMs += performance.now() - t0;
          return false;
        }
      }
      this.job++;
      this.tri = 0;
    }
    this.buildMs += performance.now() - t0;
    this.ready = true;
    this.jobs = [];
    return true;
  }

  private markTriangle(pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, a: number, b: number, c: number, m: Float32Array, bit: number) {
    const s = this.stack;
    let top = 0;
    for (const v of [a, b, c]) {
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
      s[top++] = m[0] * x + m[4] * y + m[8] * z + m[12];
      s[top++] = m[1] * x + m[5] * y + m[9] * z + m[13];
      s[top++] = m[2] * x + m[6] * y + m[10] * z + m[14];
    }
    const { ox, oy, oz, cell, nx, ny, nz, data } = this;
    while (top > 0) {
      top -= 9;
      const ax = s[top], ay = s[top + 1], az = s[top + 2], bx = s[top + 3], by = s[top + 4], bz = s[top + 5], cx = s[top + 6], cy = s[top + 7], cz = s[top + 8];
      const i0 = Math.floor((Math.min(ax, bx, cx) - ox) / cell), i1 = Math.floor((Math.max(ax, bx, cx) - ox) / cell);
      const j0 = Math.floor((Math.min(ay, by, cy) - oy) / cell), j1 = Math.floor((Math.max(ay, by, cy) - oy) / cell);
      const k0 = Math.floor((Math.min(az, bz, cz) - oz) / cell), k1 = Math.floor((Math.max(az, bz, cz) - oz) / cell);
      if (i1 < 0 || j1 < 0 || k1 < 0 || i0 >= nx || j0 >= ny || k0 >= nz) continue;
      if (i1 - i0 <= 1 && j1 - j0 <= 1 && k1 - k0 <= 1 || top > s.length - 27) {
        for (let k = Math.max(k0, 0); k <= Math.min(k1, nz - 1); k++)
          for (let j = Math.max(j0, 0); j <= Math.min(j1, ny - 1); j++)
            for (let i = Math.max(i0, 0); i <= Math.min(i1, nx - 1); i++) data[(k * ny + j) * nx + i] |= bit;
        continue;
      }
      // Too big for a few cells: cut the longest edge in half and handle both halves.
      const ab = (ax - bx) ** 2 + (ay - by) ** 2 + (az - bz) ** 2, bc = (bx - cx) ** 2 + (by - cy) ** 2 + (bz - cz) ** 2, ca = (cx - ax) ** 2 + (cy - ay) ** 2 + (cz - az) ** 2;
      if (ab >= bc && ab >= ca) {
        const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
        s.set([ax, ay, az, mx, my, mz, cx, cy, cz, mx, my, mz, bx, by, bz, cx, cy, cz], top);
      } else if (bc >= ca) {
        const mx = (bx + cx) / 2, my = (by + cy) / 2, mz = (bz + cz) / 2;
        s.set([ax, ay, az, bx, by, bz, mx, my, mz, ax, ay, az, mx, my, mz, cx, cy, cz], top);
      } else {
        const mx = (cx + ax) / 2, my = (cy + ay) / 2, mz = (cz + az) / 2;
        s.set([ax, ay, az, bx, by, bz, mx, my, mz, mx, my, mz, bx, by, bz, cx, cy, cz], top);
      }
      top += 18;
    }
  }

  /** Is the point inside something solid? `mask`: which bits count (SOLID, plus CUTAWAY unless the current shot has cut it away). Outside the grid is empty. */
  solidAt(x: number, y: number, z: number, mask: number): boolean {
    const i = Math.floor((x - this.ox) / this.cell), j = Math.floor((y - this.oy) / this.cell), k = Math.floor((z - this.oz) / this.cell);
    if (i < 0 || j < 0 || k < 0 || i >= this.nx || j >= this.ny || k >= this.nz) return false;
    return (this.data[(k * this.ny + j) * this.nx + i] & mask) !== 0;
  }

  /** How far from a, along the straight line to b, is the first solid cell (not counting the first `skip` metres)? Infinity if there is none before b. (Amanatides & Woo's grid walk.) */
  firstSolid(ax: number, ay: number, az: number, bx: number, by: number, bz: number, skip: number, mask: number): number {
    const dx = bx - ax, dy = by - ay, dz = bz - az;
    const len = Math.hypot(dx, dy, dz);
    if (len < 1e-6) return Infinity;
    const { cell, nx, ny, nz, data } = this;
    const gx = (ax - this.ox) / cell, gy = (ay - this.oy) / cell, gz = (az - this.oz) / cell;
    let i = Math.floor(gx), j = Math.floor(gy), k = Math.floor(gz);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1, sz = dz > 0 ? 1 : -1;
    const adx = Math.abs(dx) / cell, ady = Math.abs(dy) / cell, adz = Math.abs(dz) / cell; // cells crossed per unit of t (0 at a, 1 at b)
    const tdx = adx > 1e-12 ? 1 / adx : Infinity, tdy = ady > 1e-12 ? 1 / ady : Infinity, tdz = adz > 1e-12 ? 1 / adz : Infinity;
    let tx = adx > 1e-12 ? (sx > 0 ? i + 1 - gx : gx - i) * tdx : Infinity;
    let ty = ady > 1e-12 ? (sy > 0 ? j + 1 - gy : gy - j) * tdy : Infinity;
    let tz = adz > 1e-12 ? (sz > 0 ? k + 1 - gz : gz - k) * tdz : Infinity;
    let t = 0;
    for (let guard = 0; guard < 4096; guard++) {
      if (t * len >= skip && i >= 0 && j >= 0 && k >= 0 && i < nx && j < ny && k < nz && (data[(k * ny + j) * nx + i] & mask) !== 0) return t * len;
      if (tx <= ty && tx <= tz) {
        t = tx;
        i += sx;
        tx += tdx;
      } else if (ty <= tz) {
        t = ty;
        j += sy;
        ty += tdy;
      } else {
        t = tz;
        k += sz;
        tz += tdz;
      }
      if (t > 1) return Infinity;
    }
    return Infinity;
  }

  /** Does the straight line from a to b cross nothing solid, not counting the last `gap` metres before b? */
  clearLine(ax: number, ay: number, az: number, bx: number, by: number, bz: number, gap: number, mask: number): boolean {
    const len = Math.hypot(bx - ax, by - ay, bz - az);
    return this.firstSolid(ax, ay, az, bx, by, bz, 0, mask) >= len - gap;
  }
}

/** The heights above his feet that must all be in sight: low, middle and top of his body. */
const BODY = [0.12, 0.25, 0.37];
/** The last stretch of each line (m) is not tested: it is the surface he stands on and whatever is touching him (stock he stands among). */
const GAP = 0.08;

/** Can a camera at (cx, cy, cz) see all of Hue, whose feet are at f? */
export function seesHue(g: SightGrid, cx: number, cy: number, cz: number, f: THREE.Vector3, mask: number): boolean {
  if (g.solidAt(cx, cy, cz, mask)) return false;
  for (const h of BODY) if (!g.clearLine(cx, cy, cz, f.x, f.y + h, f.z, GAP, mask)) return false;
  return true;
}

export type ViewLimits = { x0: number; x1: number; z0: number; z1: number; yMin: number; yMax: number };

type Cand = { x: number; y: number; z: number; cost: number };
const pool: Cand[] = Array.from({ length: 5 * 24 }, () => ({ x: 0, y: 0, z: 0, cost: 0 }));
/** Directions tried round the wanted one (radians): higher or lower, and swung to either side (in fine steps near the wanted one, so a narrow opening such as a freezer door is found, and right round to the far side of him as a last resort). */
const LIFTS = [0, 0.22, 0.48, 0.78, -0.2];
const SWINGS = [0, 0.1, -0.1, 0.2, -0.2, 0.32, -0.32, 0.46, -0.46, 0.62, -0.62, 0.8, -0.8, 1, -1, 1.3, -1.3, 1.65, -1.65, 2.05, -2.05, 2.5, -2.5, Math.PI];
/** The closest the camera comes to him (m): he fills most of the picture there. */
const MIN_ARM = 0.5;
/** Room left between the camera and the first thing in the way along its arm (m). */
const ARM_MARGIN = 0.12;
const MAX_ELEVATION = (62 * Math.PI) / 180;

/** What the last search did (for tests): directions tried, how many were too close, out of bounds or not allowed, and how many were checked in full. */
export const viewStats = { dirs: 0, shortArm: 0, outside: 0, notAllowed: 0, verified: 0 };

/**
 * Where to put the camera so it sees Hue, as close to `want` as possible. In each direction round the wanted one the camera goes as far out as the way is clear (up to the wanted
 * distance), so where something is close behind him it comes in and he fills more of the picture; directions are preferred in the order: wanted, higher, swung to the side, and
 * the ones that keep the distance. `prev` (the last answer) is preferred when several are equally good, so the camera does not flicker between two spots. False if nothing within
 * reach sees him.
 */
export function findView(
  g: SightGrid,
  want: THREE.Vector3,
  f: THREE.Vector3,
  mask: number,
  lim: ViewLimits,
  prev: THREE.Vector3 | null,
  out: THREE.Vector3,
  /** Extra say over where the camera may stand (a fixture's footprint, say). */
  allowed: ((x: number, y: number, z: number) => boolean) | null = null,
  maxVerify = 24,
): boolean {
  const px = f.x, py = f.y + 0.25, pz = f.z;
  const dx = want.x - px, dy = want.y - py, dz = want.z - pz;
  const dist = Math.hypot(dx, dy, dz);
  const r0 = Math.max(0.7, dist);
  const az0 = Math.atan2(dz, dx);
  const el0 = Math.asin(THREE.MathUtils.clamp(dy / Math.max(1e-6, dist), -1, 1));
  let n = 0;
  viewStats.dirs = viewStats.shortArm = viewStats.outside = viewStats.notAllowed = viewStats.verified = 0;
  for (const lift of LIFTS) {
    const el = Math.min(MAX_ELEVATION, el0 + lift);
    const ce = Math.cos(el), se = Math.sin(el);
    for (const sw of SWINGS) {
      const az = az0 + sw;
      const ux = Math.cos(az) * ce, uy = se, uz = Math.sin(az) * ce;
      const free = g.firstSolid(px, py, pz, px + ux * (r0 + 0.2), py + uy * (r0 + 0.2), pz + uz * (r0 + 0.2), 0.12, mask);
      const r = Math.min(r0, free - ARM_MARGIN);
      viewStats.dirs++;
      if (r < MIN_ARM) {
        viewStats.shortArm++;
        continue;
      }
      const x = px + ux * r, y = py + uy * r, z = pz + uz * r;
      if (x < lim.x0 || x > lim.x1 || z < lim.z0 || z > lim.z1 || y < lim.yMin || y > lim.yMax) {
        viewStats.outside++;
        continue;
      }
      if (allowed && !allowed(x, y, z)) {
        viewStats.notAllowed++;
        continue;
      }
      let cost = (1 - r / r0) * 1.0 + (el - el0) * 1.4 + Math.abs(sw) * 1.6;
      if (prev) cost += Math.hypot(x - prev.x, y - prev.y, z - prev.z) * 0.35;
      const c = pool[n++];
      c.x = x;
      c.y = y;
      c.z = z;
      c.cost = cost;
    }
  }
  // Cheapest first, until one really sees all of him (the arm check above only looked along his chest line).
  for (let tried = 0; tried < maxVerify; tried++) {
    let bi = -1;
    for (let i = 0; i < n; i++) if (pool[i].cost < Infinity && (bi < 0 || pool[i].cost < pool[bi].cost)) bi = i;
    if (bi < 0) return false;
    const c = pool[bi];
    c.cost = Infinity;
    viewStats.verified++;
    if (seesHue(g, c.x, c.y, c.z, f, mask)) {
      out.set(c.x, c.y, c.z);
      return true;
    }
  }
  return false;
}
