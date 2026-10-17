// Scratch: at a spot, what the sight map says, and the oracle's verdict, for the camera the shot wants.
import { chromium } from 'playwright-core';
const [x, y, z, cx, cy, cz] = process.argv.slice(2).map(Number);
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await page.goto('http://localhost:3100/?level=deli&test');
await page.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 90000 });
await page.waitForTimeout(2500);
const r = await page.evaluate(([x, y, z, cx, cy, cz]) => {
  const h = window.__hue, S = window.__sight, V = h.scene.children[0].constructor;
  const feet = h.runtime.feet.clone().set(x, y, z);
  const out = { map: S.seesHue(S.grid, cx, cy, cz, feet, 3) };
  // each body height: distance to first solid in the map vs to first mesh hit by the oracle
  const THREE_V = h.runtime.feet.constructor;
  const cam = new THREE_V(cx, cy, cz);
  out.lines = [0.12, 0.25, 0.37].map((hh) => { const t = new THREE_V(x, y + hh, z); const d = S.grid.firstSolid(cx, cy, cz, t.x, t.y, t.z, 0, 3); const dir = t.clone().sub(cam); const dist = dir.length(); dir.normalize(); h.raycaster.set(cam, dir); h.raycaster.far = dist; const ms = []; h.scene.traverse((o) => { if (o.isMesh && o.visible && /^V_/.test(o.name)) ms.push(o); }); const hit = h.raycaster.intersectObjects(ms, false).filter((i) => { const m = Array.isArray(i.object.material) ? i.object.material[0] : i.object.material; return !((m.transparent && m.opacity < 0.6) || /glaz|glass/i.test(m.name)); })[0]; return { h: hh, dist: +dist.toFixed(2), mapFirst: d === Infinity ? null : +d.toFixed(2), oracle: hit ? `${hit.object.name}@${hit.distance.toFixed(2)}` : null }; });
  // the solver
  const want = cam.clone(); const o = cam.clone();
  out.obstacles = (S.rig.obstacles ?? []).length; for (const mv of [24, 80, 400]) { const ob = S.rig.obstacles ?? []; const allowed = (x, y, z) => !ob.some((q) => x >= q.x0 - 0.06 && x <= q.x1 + 0.06 && z >= q.z0 - 0.06 && z <= q.z1 + 0.06 && y < q.top + 0.12); const found = S.findView(S.grid, want, feet, 3, { x0: -3.7, x1: 3.7, z0: -2.6, z1: 2.45, yMin: 0.5, yMax: 3.8 }, null, o, allowed, mv); out['found' + mv] = found ? o.toArray().map((v) => +v.toFixed(2)) : null; out['stats' + mv] = { ...S.viewStats }; }
  return out;
}, [x, y, z, cx, cy, cz]);
console.log(JSON.stringify(r, null, 1));
await browser.close();
