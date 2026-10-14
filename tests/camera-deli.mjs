// The deli's camera, checked in a real (headless) browser: wherever Hue can be, he is in view, and the camera is inside the shop's walls and not inside a fixture.
// Needs the dev server:  npx next dev -p 3100     then:  node tests/camera-deli.mjs
// "Clear" = a ray from the camera to Hue's chest hits none of the model's opaque meshes. If something is in the way he is still seen (the level's x-ray silhouette
// draws him through it): reported as XRAY, which passes, so the numbers show how often the camera alone could not see him. Chase-camera spots are walked into (the camera follows his heading), high
// spots are teleported to (no chase there).
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
    ['crates', -3.0, 0.4, -1.1], ['counter west', -3.05, 0.68, -0.3], ['counter strip', -3.36, 0.68, 0.6], ['donut top', -3.05, 1.2, 0.5], ['L-corner', -3.2, 0.585, 1.1], ['deck', -1.5, 0.55, 1.1], ['deck north', 0.8, 0.55, 1.1],
    ['condiment ledge', -0.4, 1.0, 1.25], ['hot line', -2.0, 0.55, 2.1], ['hot line back', 0.6, 0.55, 2.1], ['griddle', -1.56, 0.64, 2.15], ['median top w', -1.5, 1.86, -0.5], ['median top e', 0.7, 1.86, -0.3],
    ['cold run top', 0.3, 1.95, -2.1], ['cold run far', 2.5, 1.95, -2.2], ['back run top', 3.4, 1.95, -1.0], ['chip rack top', -2.67, 1.75, -2.4], ['carton top', 1.9, 2.04, 1.1], ['liquor cooler top', 2.7, 1.99, 1.2],
  ];
  for (const [label, x, y, z] of spots) { tp(x, y, z); out.push(await measure(label, 1800)); }
  return out;
});

let bad = 0, xray = 0;
const xrayOn = await page.evaluate(() => !!window.__hue.level().xray);
for (const r of rows) {
  const problems = [r.hidden && !xrayOn && `HIDDEN by ${r.hidden}`, r.outside && 'OUTSIDE the walls', r.inside && `INSIDE ${r.inside}`].filter(Boolean);
  const viaXray = r.hidden && xrayOn && !problems.length;
  if (problems.length) bad++;
  if (viaXray) xray++;
  console.log(`${problems.length ? 'FAIL' : viaXray ? 'XRAY' : 'PASS'}  ${r.label.padEnd(22)} cam ${r.cam}${problems.length ? '   ' + problems.join('; ') : viaXray ? `   behind ${r.hidden} (seen through the silhouette)` : ''}`);
}
console.log(errors.length ? '\nbrowser errors:\n' + [...new Set(errors)].join('\n') : '\nno browser errors');
console.log(`\n${rows.length - bad - xray} clear, ${xray} seen through the x-ray silhouette, ${bad} failing, of ${rows.length} spots`);
await browser.close();
process.exit(bad || errors.length ? 1 : 0);
