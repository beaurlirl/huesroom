// Does his drawn body stand on what is drawn? For every resting spot the explorer found (tests/reach/raw/<level>.json), a ray goes straight down through his position (and four points 3 cm round it) against the drawn
// meshes (the room's, not the loose props that can be kicked about) (the first surface within 25 cm above his feet or 25 cm below): the "sink" is how far that surface is above his feet (positive) or below (negative). Then the same with his
// drawn body moved by the game's lift (levels.ts `snapFeet`, src/surface.ts). The lift is worked out from a map of drawn tops; the check here is the real mesh, so it is not marking its own work.
//   node tests/feet.mjs [level=deli]      (dev server on 3100)
import fs from 'fs';
import { chromium } from 'playwright-core';

const level = process.argv[2] ?? 'deli';
const raw = JSON.parse(fs.readFileSync(new URL(`./reach/raw/${level}.json`, import.meta.url)));
const spots = raw.visited.map(([, v]) => [v.x, v.y, v.z]);
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 900, height: 560 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(`http://localhost:3100/?level=${level}&test`);
await page.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 90000 });
await page.waitForFunction(() => window.__hue.runtime.debug.feetLift !== null, null, { timeout: 30000 });
// The map is built in slices after the level has loaded: wait until it answers (any spot with a lift, or a few seconds).
await page.waitForTimeout(2500);
const rows = await page.evaluate((spots) => {
  const h = window.__hue, rc = h.raycaster, V = h.camera.position.constructor, lift = h.runtime.debug.feetLift;
  h.scene.updateMatrixWorld(true);
  const ms = [];
  h.scene.traverse((o) => { if (o.isMesh && o.visible && /^V_/.test(o.name)) { let ok = true; for (let p = o.parent; p && ok; p = p.parent) ok = p.visible; if (ok) ms.push(o); /* glass counts: he stands on the glass dome's lid */ } });
  // Under his whole footprint (the middle and four points 3 cm round it), the highest drawn surface within 25 cm of his feet: standing on the edge of a carton is standing on the carton.
  const ring = [[0, 0], [0.03, 0], [-0.03, 0], [0, 0.03], [0, -0.03]];
  return spots.map(([x, y, z]) => {
    let top = null;
    for (const [dx, dz] of ring) {
      rc.set(new V(x + dx, y + 0.5, z + dz), new V(0, -1, 0)); rc.near = 0; rc.far = 0.75;
      const hit = rc.intersectObjects(ms, false)[0];
      if (hit && (top === null || hit.point.y > top)) top = hit.point.y;
    }
    return { x, y, z, d: top === null ? null : top - y, lift: lift(x, y, z) };
  });
}, spots);
// A surface he could be standing on is within 25 cm of his feet; a drawn thing taller than that above his feet is stock he is physically among (the freezer's products), which no lift can fix.
const among = rows.filter((r) => r.d !== null && r.d > 0.25).length;
const have = rows.filter((r) => r.d !== null && Math.abs(r.d) <= 0.25);
const count = (f) => have.filter(f).length;
const before = { sunk: count((r) => r.d > 0.03), float: count((r) => r.d < -0.03) };
const after = { sunk: count((r) => r.d - r.lift > 0.03), float: count((r) => r.d - r.lift < -0.03) };
const surf = await page.evaluate(() => { const m = window.__hue.runtime.debug.surface; return { lost: m.lost, ms: Math.round(m.buildMs), ready: m.ready }; });
console.log(`  surface map: ${surf.ready ? 'ready' : 'NOT READY'}, built in ${surf.ms} ms, ${surf.lost} surfaces did not fit`);
const moved = rows.filter((r) => Math.abs(r.lift) > 0.012);
console.log(`  ${rows.length} spots, ${have.length} with a drawn surface within 25 cm of his feet (${among} more are among stock taller than that); his body is moved at ${moved.length} (largest ${(Math.max(...rows.map((r) => Math.abs(r.lift))) * 100).toFixed(0)} cm)`);
console.log(`  sunk into a drawn surface by more than 3 cm: ${before.sunk} before, ${after.sunk} with the lift;  hovering more than 3 cm above one: ${before.float} before, ${after.float} with the lift`);
const worst = have.map((r) => ({ ...r, after: r.d - r.lift })).filter((r) => r.after > 0.03).sort((a, b) => b.after - a.after).slice(0, 4);
for (const r of worst) console.log(`    still sunk ${(r.after * 100).toFixed(0)} cm at ${r.x.toFixed(2)},${r.y.toFixed(2)},${r.z.toFixed(2)} (lift ${(r.lift * 100).toFixed(0)} cm, drawn surface ${(r.d * 100).toFixed(0)} cm above)`);
check('the lift all but ends sinking into drawn tops', after.sunk <= Math.max(3, Math.floor(before.sunk * 0.25)), `${before.sunk} -> ${after.sunk}`);
check('and does not make hovering worse', after.float <= before.float, `${before.float} -> ${after.float}`);
check('no browser errors', errors.length === 0, [...new Set(errors)].slice(0, 2).join(' | '));
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
