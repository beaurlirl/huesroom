import * as THREE from "three";

/**
 * The drawn tops in a level: where a flat surface you can see is, for every spot on the floor plan, in a few layers (the floor, a counter, the shelf above it...).
 *
 * Hue stands on invisible boxes that only roughly follow what is drawn: a row of cartons on a cooler is a few centimetres above the box he walks on, and between two cartons
 * the drawn top is a hand lower. So his drawn body is eased to the drawn surface under his feet (levels.ts `snapFeet`), while the physics stays exactly as it is (the routes
 * and the jumps do not move). The map is built once the level has loaded, in slices of a few milliseconds, from the flat faces of the room (not loose props, coins or colliders).
 */
const LAYERS = 40;

type Job = { geo: THREE.BufferGeometry; m: Float32Array };

export class SurfaceMap {
  readonly nx: number;
  readonly nz: number;
  /** Per cell, up to LAYERS heights, lowest first (NaN = unused). */
  private heights: Float32Array;
  private count: Uint8Array;
  private jobs: Job[] = [];
  private job = 0;
  private tri = 0;
  ready = false;
  buildMs = 0;
  /** Surfaces that did not fit (a column with more than LAYERS of them): for tests. */
  lost = 0;

  constructor(
    readonly ox: number,
    readonly oz: number,
    readonly cell: number,
    sizeX: number,
    sizeZ: number,
  ) {
    this.nx = Math.ceil(sizeX / cell);
    this.nz = Math.ceil(sizeZ / cell);
    this.heights = new Float32Array(this.nx * this.nz * LAYERS);
    this.count = new Uint8Array(this.nx * this.nz);
  }

  /** Queues every mesh under `root` that `include` accepts. Call `step` until it returns true. */
  add(root: THREE.Object3D, include: (mesh: THREE.Mesh) => boolean) {
    root.updateMatrixWorld(true);
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh || !mesh.geometry.attributes.position || !include(mesh)) return;
      this.jobs.push({ geo: mesh.geometry, m: Float32Array.from(mesh.matrixWorld.elements) });
    });
    this.ready = this.jobs.length === 0;
  }

  /** Rasterises for up to `ms` milliseconds. True when everything is done. */
  step(ms: number): boolean {
    if (this.ready) return true;
    const t0 = performance.now();
    let n = 0;
    while (this.job < this.jobs.length) {
      const { geo, m } = this.jobs[this.job];
      const pos = geo.attributes.position;
      const idx = geo.index;
      const count = idx ? idx.count : pos.count;
      while (this.tri * 3 < count) {
        const i0 = this.tri * 3;
        this.rasterise(pos, idx ? idx.getX(i0) : i0, idx ? idx.getX(i0 + 1) : i0 + 1, idx ? idx.getX(i0 + 2) : i0 + 2, m);
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

  private rasterise(pos: THREE.BufferAttribute | THREE.InterleavedBufferAttribute, a: number, b: number, c: number, m: Float32Array) {
    const w = (v: number, k: number) => {
      const x = pos.getX(v), y = pos.getY(v), z = pos.getZ(v);
      return m[k] * x + m[k + 4] * y + m[k + 8] * z + m[k + 12];
    };
    const ax = w(a, 0), ay = w(a, 1), az = w(a, 2), bx = w(b, 0), by = w(b, 1), bz = w(b, 2), cx = w(c, 0), cy = w(c, 1), cz = w(c, 2);
    // Flat and gently sloping faces (the normal's y, from the cross product of two edges, over its length). A carton's rounded top is a few tilted faces, and some of the model's thin slabs are wound the other way, so either way up counts; and the map only ever
    // looks within a hand of his feet, where the underside of a box is just another layer below its top.
    const ux = bx - ax, uy = by - ay, uz = bz - az, vx = cx - ax, vy = cy - ay, vz = cz - az;
    const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz);
    if (len < 1e-9 || Math.abs(ny) / len < 0.3) return;
    const { ox, oz, cell } = this;
    const i0 = Math.max(0, Math.ceil((Math.min(ax, bx, cx) - ox) / cell - 0.5)), i1 = Math.min(this.nx - 1, Math.floor((Math.max(ax, bx, cx) - ox) / cell - 0.5));
    const k0 = Math.max(0, Math.ceil((Math.min(az, bz, cz) - oz) / cell - 0.5)), k1 = Math.min(this.nz - 1, Math.floor((Math.max(az, bz, cz) - oz) / cell - 0.5));
    // The plane: y = ay - (nx (x - ax) + nz (z - az)) / ny.
    const d = (bz - cz) * (ax - cx) + (cx - bx) * (az - cz);
    if (Math.abs(d) < 1e-12) return;
    for (let k = k0; k <= k1; k++) {
      const z = oz + (k + 0.5) * cell;
      for (let i = i0; i <= i1; i++) {
        const x = ox + (i + 0.5) * cell;
        const l1 = ((bz - cz) * (x - cx) + (cx - bx) * (z - cz)) / d;
        const l2 = ((cz - az) * (x - cx) + (ax - cx) * (z - cz)) / d;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        this.insert(i, k, l1 * ay + l2 * by + l3 * cy);
      }
    }
  }

  private insert(i: number, k: number, y: number) {
    const cellIndex = k * this.nx + i;
    const base = cellIndex * LAYERS;
    const n = this.count[cellIndex];
    const h = this.heights;
    let at = n;
    for (let j = 0; j < n; j++) {
      const hj = h[base + j];
      if (Math.abs(hj - y) < 0.02) return; // the same surface (a second triangle, or two skins of it)
      if (hj > y && at === n) at = j;
    }
    if (n >= LAYERS) {
      this.lost++;
      return;
    }
    for (let j = n; j > at; j--) h[base + j] = h[base + j - 1];
    h[base + at] = y;
    this.count[cellIndex] = n + 1;
  }

  /** The highest drawn surface within `range` metres above or below `y` at (x, z): what covers his legs if it is above his feet, or what he hovers over if it is below. Null if there is none. */
  topNear(x: number, z: number, y: number, range: number): number | null {
    const i = Math.floor((x - this.ox) / this.cell), k = Math.floor((z - this.oz) / this.cell);
    if (i < 0 || k < 0 || i >= this.nx || k >= this.nz) return null;
    const cellIndex = k * this.nx + i;
    const base = cellIndex * LAYERS;
    let best: number | null = null;
    for (let j = 0, n = this.count[cellIndex]; j < n; j++) {
      const hj = this.heights[base + j];
      if (hj > y + range) break; // lowest first: nothing higher is in range
      if (hj >= y - range) best = hj;
    }
    return best;
  }
}
