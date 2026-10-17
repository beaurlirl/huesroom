// Which drawn meshes does he sink into? For every resting spot, the first drawn surface under him (within 25 cm above his feet): per mesh, how many spots, the typical sink, and the mesh's
// own size and material, so a mesh that lies wholly on one surface can be nudged down by the right amount.
import fs from 'fs';
import { chromium } from 'playwright-core';
const level = process.argv[2] ?? 'deli';
const raw = JSON.parse(fs.readFileSync(new URL(`../reach/raw/${level}.json`, import.meta.url)));
const spots = raw.visited.map(([k, v]) => [v.x, v.y, v.z]);
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 900, height: 560 } })).newPage();
await page.goto(`http://localhost:3100/?level=${level}&test`);
await page.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 90000 });
const res = await page.evaluate((spots) => {
  const h = window.__hue, rc = h.raycaster, V = h.camera.position.constructor;
  h.scene.updateMatrixWorld(true);
  const ms = [];
  h.scene.traverse((o) => { if (o.isMesh && o.visible && /^(V_|BOOK_KICK)/.test(o.name)) { let ok = true; for (let p = o.parent; p && ok; p = p.parent) ok = p.visible && !p.userData.door; const m = Array.isArray(o.material) ? o.material[0] : o.material; if (ok && !((m.transparent && m.opacity < 0.6) || /glaz|glass/i.test(m.name))) ms.push(o); } });
  const by = {};
  for (const [x, y, z] of spots) {
    rc.set(new V(x, y + 0.5, z), new V(0, -1, 0)); rc.near = 0; rc.far = 3;
    const hit = rc.intersectObjects(ms, false)[0];
    if (!hit) continue;
    const d = hit.point.y - y;
    if (d < 0.02 || d > 0.25) continue;
    const o = hit.object; const e = by[o.name] ?? (by[o.name] = { n: 0, d: [], at: [] });
    e.n++; e.d.push(d); if (e.at.length < 3) e.at.push([x, y, z].map((v) => +v.toFixed(2)).join(','));
  }
  const info = (name) => { const o = ms.find((m) => m.name === name); o.geometry.computeBoundingBox(); const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld); const m = Array.isArray(o.material) ? o.material[0] : o.material; return { min: b.min.toArray().map((v) => +v.toFixed(2)), max: b.max.toArray().map((v) => +v.toFixed(2)), mat: m.name, tris: Math.round((o.geometry.index?.count ?? o.geometry.attributes.position.count) / 3), parent: o.parent?.name }; };
  return Object.entries(by).map(([name, e]) => ({ name, n: e.n, med: e.d.sort((a, b) => a - b)[Math.floor(e.d.length / 2)], max: Math.max(...e.d), at: e.at, ...info(name) }));
}, spots);
res.sort((a, b) => b.n - a.n);
for (const r of res.filter((r) => r.n >= 2)) console.log(`${r.name.padEnd(18)} ${String(r.n).padStart(3)} spots, sunk median ${(r.med * 100).toFixed(0)} max ${(r.max * 100).toFixed(0)} cm | ${r.mat} | ${r.tris} tris | in ${r.parent} | box x ${r.min[0]}..${r.max[0]} y ${r.min[1]}..${r.max[1]} z ${r.min[2]}..${r.max[2]} | e.g. ${r.at[0]}`);
await browser.close();
