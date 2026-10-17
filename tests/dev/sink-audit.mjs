// Is he standing on what he seems to stand on? For every resting spot the explorer found, a ray goes straight down through his position against the drawn (visible) meshes and
// the height of the first surface is compared with his feet: a positive "sink" means the drawn surface is above his feet (he is sunk into it); negative means he floats above it.
//   node tests/dev/sink-audit.mjs [level=deli] [minSink=0.02]
import fs from 'fs';
import { chromium } from 'playwright-core';
const level = process.argv[2] ?? 'deli', MIN = Number(process.argv[3] ?? 0.02);
const raw = JSON.parse(fs.readFileSync(new URL(`../reach/raw/${level}.json`, import.meta.url)));
const spots = raw.visited.map(([k, v]) => [v.x, v.y, v.z]);
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 900, height: 560 } })).newPage();
await page.goto(`http://localhost:3100/?level=${level}&test`);
await page.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 90000 });
const rows = await page.evaluate((spots) => {
  const h = window.__hue, rc = h.raycaster, V = h.camera.position.constructor;
  h.scene.updateMatrixWorld(true);
  const ms = [];
  h.scene.traverse((o) => { if (o.isMesh && o.visible && /^(V_|BOOK_KICK)/.test(o.name)) { let ok = true; for (let p = o.parent; p && ok; p = p.parent) ok = p.visible && !p.userData.door; const m = Array.isArray(o.material) ? o.material[0] : o.material; if (ok && !((m.transparent && m.opacity < 0.6) || /glaz|glass/i.test(m.name))) ms.push(o); } });
  const out = [];
  for (const [x, y, z] of spots) {
    rc.set(new V(x, y + 0.5, z), new V(0, -1, 0)); rc.near = 0; rc.far = 3;
    const hit = rc.intersectObjects(ms, false)[0];
    const col = h.colliders.filter((c) => Math.abs(c.center.y + c.halfExtents.y - y) < 0.03 && x >= c.center.x - c.halfExtents.x - 0.07 && x <= c.center.x + c.halfExtents.x + 0.07 && z >= c.center.z - c.halfExtents.z - 0.07 && z <= c.center.z + c.halfExtents.z + 0.07).map((c) => c.name.replace('COL_', ''))[0];
    out.push({ x, y, z, top: hit ? +(hit.point.y).toFixed(3) : null, mesh: hit?.object.name ?? null, col: col ?? null });
  }
  return out;
}, spots);
// Per collider (what he stands on): how many resting spots, and how far the drawn surface is above (sunk) or below (floating) his feet there. Only surfaces within 25 cm count as
// "the surface he is standing on"; anything farther is stock or something else in the way, or no drawn surface at all.
const by = new Map();
for (const r of rows) {
  const k = r.col ?? '(floor or other)';
  const c = by.get(k) ?? { n: 0, d: [], none: 0, y: new Set() };
  c.n++; c.y.add(r.y.toFixed(2));
  if (r.top === null) c.none++; else { const d = r.top - r.y; if (Math.abs(d) <= 0.25) c.d.push(d); else c.none++; }
  by.set(k, c);
}
const q = (a, p) => a.length ? a.slice().sort((x, y) => x - y)[Math.min(a.length - 1, Math.floor(a.length * p))] : NaN;
console.log('what he stands on'.padEnd(26), 'spots  at y            drawn surface vs feet, cm: median  p10  p90   (+ = sunk, - = floating)   no drawn surface within 25 cm');
for (const [k, c] of [...by].sort((a, b) => Math.abs(q(b[1].d, 0.5) || 0) - Math.abs(q(a[1].d, 0.5) || 0))) {
  if (c.n < 3) continue;
  const m = q(c.d, 0.5);
  console.log(k.padEnd(26), String(c.n).padStart(5), ' ', [...c.y].slice(0, 3).join('/').padEnd(14), isNaN(m) ? '       -' : `${(m * 100).toFixed(0).padStart(14)} ${(q(c.d, 0.1) * 100).toFixed(0).padStart(4)} ${(q(c.d, 0.9) * 100).toFixed(0).padStart(4)}`, '                         ', c.none);
}
await browser.close();
