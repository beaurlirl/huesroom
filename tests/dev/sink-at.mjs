// Scratch: for a grid of points on a surface, the first drawn surface under each (height and mesh), against a given feet height.
//   node tests/dev/sink-at.mjs <feetY> <x0> <x1> <z0> <z1> [step=0.2]
import { chromium } from 'playwright-core';
const [fy, x0, x1, z0, z1, step = '0.2'] = process.argv.slice(2).map(Number);
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 900, height: 560 } })).newPage();
await page.goto('http://localhost:3100/?level=deli&test');
await page.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 90000 });
const rows = await page.evaluate(([fy, x0, x1, z0, z1, step]) => {
  const h = window.__hue, rc = h.raycaster, V = h.camera.position.constructor;
  h.scene.updateMatrixWorld(true);
  const ms = [];
  h.scene.traverse((o) => { if (o.isMesh && o.visible && /^(V_|BOOK_KICK)/.test(o.name)) { let ok = true; for (let p = o.parent; p && ok; p = p.parent) ok = p.visible && !p.userData.door; const m = Array.isArray(o.material) ? o.material[0] : o.material; if (ok && !((m.transparent && m.opacity < 0.6) || /glaz|glass/i.test(m.name))) ms.push(o); } });
  const out = [];
  for (let z = z0; z <= z1 + 1e-6; z += step) { const row = []; for (let x = x0; x <= x1 + 1e-6; x += step) { rc.set(new V(x, fy + 0.5, z), new V(0, -1, 0)); rc.near = 0; rc.far = 3; const hit = rc.intersectObjects(ms, false)[0]; row.push(hit ? `${((hit.point.y - fy) * 100).toFixed(0).padStart(4)}${hit.object.name.replace('V_deli_', ' ').replace('V_median_shelf', ' ms').slice(0, 5).padEnd(5)}` : '   --     '); } out.push(`z ${z.toFixed(2).padStart(5)}: ` + row.join(' ')); }
  return out;
}, [fy, x0, x1, z0, z1, step]);
console.log(`feet y ${fy}; cell = how far the first drawn surface is above (+) / below (-) his feet in cm, and which mesh`);
console.log('x:       ' + Array.from({ length: Math.round((x1 - x0) / step) + 1 }, (_, i) => (x0 + i * step).toFixed(2).padStart(9)).join(' '));
console.log(rows.join('\n'));
await browser.close();
