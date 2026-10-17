// The deli's camera, checked in a real (headless) browser: the camera is inside the shop's walls and not inside a fixture, wherever Hue is, and it stays in the aisle round the middle shelf.
// (Whether Hue is in sight is judged by tests/camera-audit.mjs, which replays the recorded route and visits every spot he can reach: the spots here are teleported to, so what the
// camera does at each depends on the one before, and a 'hidden' row here is only a note.)
// Needs the dev server:  npx next dev -p 3100     then:  node tests/camera-deli.mjs
// "Clear" = a ray from the camera to Hue's chest hits none of the model's opaque meshes. If something is in the way he is still seen (the level's x-ray silhouette
// draws him through it): reported as XRAY, which passes, so the numbers show how often the camera alone could not see him. Chase-camera spots are walked into (the camera follows his heading), high
// spots are teleported to (no chase there). Then he is walked round both ends of the middle shelf, in both directions, and the camera must stay in the aisle air the whole way:
// never inside a fixture and never over the middle shelf (it follows him round the corner at his head level instead of hopping over).
import { chromium } from 'playwright-core';
const URL = process.env.URL || 'http://localhost:3100/?level=deli&test';
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
page.setDefaultTimeout(120000);
await page.goto(URL);
await page.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 90000 });
await page.keyboard.press('Shift');
await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'playing');

const rows = await page.evaluate(async () => {
  const h = window.__hue, R = h.runtime;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tp = (x, y, z) => R.debug.teleport(x, y, z, 0);
  const goto = async (x, z, run = true, timeout = 5000) => { const t0 = performance.now(); while (performance.now() - t0 < timeout) { const dx = x - R.feet.x, dz = z - R.feet.z, d = Math.hypot(dx, dz); if (d < 0.06) break; R.debug.input = { x: dx / d, z: dz / d, run, jump: false }; await sleep(30); } R.debug.input = null; };
  const meshes = () => { const out = []; h.scene.traverse((o) => { if (o.isMesh && o.visible && /^(V_|BOOK_KICK)/.test(o.name)) { let ok = true; for (let p = o.parent; p && ok; p = p.parent) ok = p.visible; if (ok) out.push(o); } }); return out; };
  const measure = async (label, settle = 1500) => {
    await sleep(settle);
    const cam = R.cameraPos.clone(), rc = h.raycaster, ms = meshes();
    const hits = [0.1, 0.28, 0.42].map((hh) => {
      const tgt = R.feet.clone(); tgt.y += hh; const dir = tgt.clone().sub(cam); const dist = dir.length(); dir.normalize();
      rc.set(cam, dir); rc.far = dist - 0.03; rc.near = 0.02;
      const hit = rc.intersectObjects(ms, false).filter((i) => { const m = Array.isArray(i.object.material) ? i.object.material[i.face?.materialIndex ?? 0] : i.object.material; return !(m && m.transparent && m.opacity < 0.6); });
      return hit.length ? `${hit[0].object.name}@${hit[0].distance.toFixed(2)}` : null;
    });
    const inside = h.colliders.filter((c) => !c.userData.ladder && !c.userData.door && c.userData.standable !== false && c.halfExtents.y * 2 < 2.4 && cam.x >= c.center.x - c.halfExtents.x && cam.x <= c.center.x + c.halfExtents.x && cam.z >= c.center.z - c.halfExtents.z && cam.z <= c.center.z + c.halfExtents.z && cam.y <= c.center.y + c.halfExtents.y).map((c) => c.name);
    const opening = R.feet.distanceTo(R.startFeet) < 2.4 && cam.x < -3.8;   // the opening shot stands outside the door on purpose
    const outside = !opening && (cam.x < -3.8 || cam.x > 3.8 || cam.z < -2.72 || cam.z > 2.47);
    return { label, cam: cam.toArray().map((v) => +v.toFixed(2)).join(','), hidden: hits[1], outside, inside: inside.join('+') };
  };
  const out = [];
  // pay at the register first: the dome opens
  tp(-2.6, 0.02, -1.3); await sleep(400);
  await goto(-3.6, -1.2); await goto(-3.64, -0.62);
  // spots walked into: [label, start, target]
  const walks = [
    ['aisle -2.4', [-3.4, -1.3], [-2.4, -1.3]], ['aisle -0.4', [-1.4, -1.3], [-0.4, -1.3]], ['aisle 1.6', [0.6, -1.3], [1.6, -1.3]], ['aisle 3.4', [2.4, -1.3], [3.4, -1.3]],
    ['freezer pocket', [-2.0, -1.4], [-2.015, -2.05]], ['back region', [1.2, -1.2], [2.0, -0.4]], ['passage in', [2.17, 1.5], [2.17, 0.55]], ['passage out', [2.17, 0.5], [2.17, 1.2]],
    ['customer aisle -1.4', [-2.6, 0.45], [-1.4, 0.45]], ['customer aisle 1.0', [-0.2, 0.45], [1.0, 0.45]],
    ['staff aisle ->front', [-1.0, 1.7], [-3.2, 1.7]], ['staff aisle ->back', [-2.0, 1.7], [0.6, 1.7]], ['front end', [-2.6, 1.7], [-3.5, 1.7]], ['lane top', [-3.5, 1.7], [-3.6, 1.1]], ['lane mid', [-3.6, 1.1], [-3.64, 0.55]], ['lane south', [-3.64, 0.5], [-3.64, -0.6]],
  ];
  for (const [label, from, to] of walks) { tp(from[0], 0.02, from[1]); await sleep(500); await goto(to[0], to[1]); out.push(await measure(label)); }
  // high and raised spots: teleported to
  const spots = [
    ['crates', -3.0, 0.4, -1.1], ['counter west', -3.05, 0.68, -0.3], ['counter strip', -3.36, 0.68, 0.6], ['donut top', -3.05, 1.2, 0.5], ['L-corner', -3.2, 0.585, 1.24], ['deck', -1.5, 0.55, 1.1], ['deck north', 0.8, 0.55, 1.1],
    ['condiment ledge', -0.4, 1.0, 1.25], ['hot line', -2.0, 0.55, 2.1], ['hot line back', 0.25, 0.55, 2.1], ['griddle', -1.56, 0.64, 2.15], ['median top w', -1.5, 1.86, -0.5], ['median top e', 0.7, 1.86, -0.3],
    ['cold run top', 0.3, 1.95, -2.1], ['cold run far', 2.5, 1.95, -2.2], ['back run top', 3.4, 1.95, -1.0], ['chip rack top', -2.67, 1.75, -2.4], ['carton top', 1.9, 2.04, 1.1], ['liquor cooler top', 2.7, 1.99, 1.2],
  ];
  for (const [label, x, y, z] of spots) { tp(x, y, z); out.push(await measure(label, 1800)); }
  return out;
});

// Round the middle shelf: the two ends join the left aisle (behind it) to the customer aisle (in front). [label, start, waypoints]
const loops = await page.evaluate(async () => {
  const h = window.__hue, R = h.runtime;
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const mid = h.colliders.find((c) => c.name === 'COL_Median shelf');
  const overMid = (c) => c.x >= mid.center.x - mid.halfExtents.x - 0.03 && c.x <= mid.center.x + mid.halfExtents.x + 0.03 && c.z >= mid.center.z - mid.halfExtents.z - 0.03 && c.z <= mid.center.z + mid.halfExtents.z + 0.03;
  const fixtureAt = (c) => h.colliders.filter((k) => !k.userData.ladder && !k.userData.door && k.userData.standable !== false && k.halfExtents.y * 2 < 2.4 && c.x >= k.center.x - k.halfExtents.x - 0.02 && c.x <= k.center.x + k.halfExtents.x + 0.02 && c.z >= k.center.z - k.halfExtents.z - 0.02 && c.z <= k.center.z + k.halfExtents.z + 0.02 && c.y <= k.center.y + k.halfExtents.y + 0.1).map((k) => k.name.replace('COL_', ''));
  const legs = [
    ['east end: left aisle -> customer aisle', [0.2, -1.3], [[1.7, -1.3], [1.8, -0.3], [1.8, 0.45], [0.2, 0.45]]],
    ['east end: customer aisle -> left aisle', [0.2, 0.45], [[1.8, 0.45], [1.8, -0.3], [1.7, -1.3], [0.2, -1.3]]],
    ['west end: customer aisle -> left aisle', [-1.0, 0.45], [[-2.45, 0.45], [-2.45, -0.3], [-2.45, -1.2], [-1.0, -1.2]]],
    ['west end: left aisle -> customer aisle', [-1.0, -1.2], [[-2.45, -1.2], [-2.45, -0.3], [-2.45, 0.45], [-1.0, 0.45]]],
    ['west end: turning back in the gap', [-2.45, 0.45], [[-2.45, -0.3], [-2.45, 0.3], [-2.45, -0.4], [-2.45, 0.35]]],
    ['east end: turning back in the gap', [1.75, 0.4], [[1.75, -0.4], [1.75, 0.3], [1.75, -0.5], [1.75, 0.35]]],
  ];
  const out = [];
  for (const [label, start, pts] of legs) {
    R.debug.input = null; R.debug.teleport(start[0], 0.02, start[1], 0); await sleep(3500); // the camera settles first (it may be coming down from a high spot)
    let n = 0, over = 0, runLen = 0, inside = new Set(), maxJump = 0, last = null, maxY = 0;
    for (const p of pts) {
      const t0 = performance.now();
      while (performance.now() - t0 < 6000) {
        const dx = p[0] - R.feet.x, dz = p[1] - R.feet.z, d = Math.hypot(dx, dz);
        if (d < 0.1) break;
        R.debug.input = { x: dx / d, z: dz / d, run: false, jump: false }; await sleep(40);
        const c = R.cameraPos; n++;
        if (overMid(c)) over++;
        // Inside a fixture counts only if it lasts (3 samples in a row, 0.12 s): a thin panel crossed in one sample while the camera changes shot is not a place he sees from.
        const fx = fixtureAt(c);
        runLen = fx.length ? runLen + 1 : 0;
        if (runLen >= 3) fx.forEach((f) => inside.add(f));
        if (last) maxJump = Math.max(maxJump, Math.hypot(c.x - last.x, c.y - last.y, c.z - last.z));
        last = c.clone(); maxY = Math.max(maxY, c.y);
      }
    }
    R.debug.input = null;
    out.push({ label, n, over, inside: [...inside].join('+'), maxY: +maxY.toFixed(2), maxJump: +maxJump.toFixed(2) });
  }
  return out;
});

let bad = 0, xray = 0;
const xrayOn = await page.evaluate(() => !!window.__hue.level().xray);
for (const r of rows) {
  const problems = [r.outside && 'OUTSIDE the walls', r.inside && `INSIDE ${r.inside}`].filter(Boolean);
  const viaXray = r.hidden && xrayOn && !problems.length;
  if (problems.length) bad++;
  if (viaXray) xray++;
  console.log(`${problems.length ? 'FAIL' : viaXray ? 'XRAY' : 'PASS'}  ${r.label.padEnd(22)} cam ${r.cam}${problems.length ? '   ' + problems.join('; ') : viaXray ? `   behind ${r.hidden} (seen through the silhouette)` : r.hidden ? `   (hidden by ${r.hidden} here; whether he is in sight is judged by tests/camera-audit.mjs)` : ''}`);
}
for (const l of loops) {
  const problems = [l.over > 3 && `camera OVER the middle shelf in ${l.over} of ${l.n} samples`, l.inside && `camera INSIDE ${l.inside}`, l.maxY > 1.7 && `camera rose to ${l.maxY} m`].filter(Boolean);
  if (problems.length) bad++;
  console.log(`${problems.length ? 'FAIL' : 'PASS'}  ${l.label.padEnd(40)} highest camera ${l.maxY} m, biggest step ${l.maxJump} m${problems.length ? '   ' + problems.join('; ') : ''}`);
}
console.log(errors.length ? '\nbrowser errors:\n' + [...new Set(errors)].join('\n') : '\nno browser errors');
console.log(`\n${rows.length + loops.length - bad - xray} clear, ${xray} seen through the x-ray silhouette, ${bad} failing, of ${rows.length} spots and ${loops.length} walks round the middle shelf`);
await browser.close();
process.exit(bad || errors.length ? 1 : 0);
