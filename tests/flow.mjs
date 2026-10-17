// Flow rules that the other suites don't cover: what the keys do on the win screen, on a fall out of the world, and in the menu.
// Needs the dev server:  npx next dev -p 3100     then:  npm run test:flow
import { chromium } from 'playwright-core';
const URL = process.env.URL || 'http://localhost:3100/?test';
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const errors = [];
const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
const phase = () => page.evaluate(() => window.__hue.useGame.getState().phase);

await page.goto(URL);
await page.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 60000 });
await page.keyboard.press('Space');
await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'playing', null, { timeout: 10000 });

// 1. Falling out of the world puts him back at the start instead of dropping him through the void with the clock running.
await page.evaluate(() => window.__hue.runtime.debug.teleport(0.5, -6, 0.2, 90));
await page.waitForTimeout(700);
const back = await page.evaluate(() => { const r = window.__hue.runtime; return { feet: r.feet.toArray().map((v) => +v.toFixed(2)), start: r.startFeet.toArray().map((v) => +v.toFixed(2)), phase: window.__hue.useGame.getState().phase }; });
check('falling below the level puts him back at the start', Math.hypot(back.feet[0] - back.start[0], back.feet[2] - back.start[2]) < 0.1 && Math.abs(back.feet[1] - back.start[1]) < 0.1 && back.phase === 'playing', JSON.stringify(back));

// 2. The jump key must not skip the win screen: a player who is still jumping as they grab the last coin would restart the level before they ever saw their time.
const coins = [[0.15,0.18,1.18],[0.675,0.843,-0.942],[0.07,0.577,0.23],[-0.735,1.173,0.94],[-0.735,0.69,-0.23],[-0.235,0.543,-1.219],[0.88,1.283,-1.422],[1.115,1.702,-0.2],[-0.989,0.69,-1.219],[-0.95,2.158,-1.33],[0.809,2.3,1.12]];
for (const [x, y, z] of coins) { await page.evaluate(([x, y, z]) => window.__hue.runtime.debug.teleport(x, y - 0.25, z, -90), [x, y, z]); await page.waitForTimeout(120); }
await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'won', null, { timeout: 5000 });
await page.keyboard.press('Space');
await page.waitForTimeout(400);
check('Space right after the last coin does not skip the win screen', (await phase()) === 'won', `phase ${await phase()}`);
await page.keyboard.press('Enter');
await page.waitForTimeout(400);
check('Enter right after the last coin does not skip it either', (await phase()) === 'won', `phase ${await phase()}`);
await page.getByRole('button', { name: /play again/i }).waitFor({ timeout: 10000 });
await page.waitForTimeout(500);
await page.keyboard.press('Space');
await page.waitForFunction(() => ['resetting', 'intro', 'ready'].includes(window.__hue.useGame.getState().phase), null, { timeout: 3000 }).then(
  () => check('once the results are showing, Space plays again', true),
  async () => check('once the results are showing, Space plays again', false, `phase ${await phase()}`),
);

// 3. The deli's walls are too tall to jump onto: from the pillar beside the left wall he used to reach the wall's top (2.34 m), walk along it and drop out of the level.
// (The jump itself is replayed in virtual time by npm run test:reach; here it is the data.)
{
  const dctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const dp = await dctx.newPage();
  dp.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await dp.goto(URL.replace('?test', '?test&level=deli'));
  await dp.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 90000 });
  const r = await dp.evaluate(() => {
    const cols = window.__hue.colliders;
    const tops = (re) => cols.filter((c) => re.test(c.name)).map((c) => +(c.center.y + c.halfExtents.y).toFixed(2));
    const shelves = cols.filter((c) => !/wall|Boundary|Rear hallway/.test(c.name) && !c.userData.ladder).map((c) => c.center.y + c.halfExtents.y);
    return { walls: tops(/wall|Boundary south|Rear hallway/), highestStandable: +Math.max(...shelves).toFixed(2) };
  });
  const lowest = Math.min(...r.walls);
  check('deli: walls are out of reach of a jump from the highest shelf top', lowest >= r.highestStandable + 0.6 + 0.4, `lowest wall top ${lowest} m, highest shelf ${r.highestStandable} m, jump 0.6 m`);
  // The glass dome over the deli case and the freezer door hang from empties at their hinges; the leaves' vertices are in world coordinates, so the hinge's position used to be applied twice
  // and the dome hung 1.4 m behind the case (Hue stood on the lid with no glass around the meat and cheese). Each leaf has to sit over its own collider.
  const doors = await dp.evaluate(() => {
    const h = window.__hue, V = h.camera.position.constructor;
    h.scene.updateMatrixWorld(true);
    const out = [];
    h.scene.traverse((node) => {
      const id = node.userData.door;
      if (!id || node.name.startsWith('COL_')) return;
      const lo = [Infinity, Infinity, Infinity], hi = [-Infinity, -Infinity, -Infinity];
      node.traverse((o) => {
        if (!o.isMesh) return;
        o.geometry.computeBoundingBox();
        const b = o.geometry.boundingBox;
        for (const x of [b.min.x, b.max.x]) for (const y of [b.min.y, b.max.y]) for (const z of [b.min.z, b.max.z]) { const p = new V(x, y, z).applyMatrix4(o.matrixWorld); [p.x, p.y, p.z].forEach((v, i) => { lo[i] = Math.min(lo[i], v); hi[i] = Math.max(hi[i], v); }); }
      });
      const cols = h.colliders.filter((c) => c.userData.door === id);
      const clo = [Infinity, Infinity, Infinity], chi = [-Infinity, -Infinity, -Infinity];
      for (const c of cols) { const a = [c.center.x, c.center.y, c.center.z], e = [c.halfExtents.x, c.halfExtents.y, c.halfExtents.z]; for (let i = 0; i < 3; i++) { clo[i] = Math.min(clo[i], a[i] - e[i]); chi[i] = Math.max(chi[i], a[i] + e[i]); } }
      const mid = (l, u, i) => (l[i] + u[i]) / 2;
      out.push({ id, off: [0, 1, 2].map((i) => +Math.abs(mid(lo, hi, i) - mid(clo, chi, i)).toFixed(2)), leaf: [lo, hi].map((a) => a.map((v) => +v.toFixed(2)).join(',')).join(' .. '), solid: [clo, chi].map((a) => a.map((v) => +v.toFixed(2)).join(',')).join(' .. ') });
    });
    return out;
  });
  check('deli: the dome and the freezer door sit over their own colliders', doors.length >= 2 && doors.every((d) => d.off[0] < 0.7 && d.off[1] < 0.7 && d.off[2] < 0.7), doors.map((d) => `${d.id} off by ${d.off.join('/')} m (leaf ${d.leaf}; solid ${d.solid})`).join('; '));
  await dctx.close();
}

// 4. The street's camera stands at the edge of the street (z = +-2.02) and the row of buildings on its side is hidden. A mesh that touches that plane and is not in a row
// stays in front of the lens: a gate that was left out of its row (its name has "road" in "broad shutter") turned the screen grey wherever Hue crossed in front of it.
{
  const sctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const sp = await sctx.newPage();
  sp.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await sp.goto(URL.replace('?test', '?test&level=street'));
  await sp.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 90000 });
  const bad = await sp.evaluate(() => {
    const H = window.__hue, out = [];
    H.scene.updateMatrixWorld(true);
    H.scene.traverse((o) => {
      if (!o.isMesh || !o.geometry) return;
      const nm = o.userData?.name ?? o.name;
      if (/^COL_|^COIN/.test(nm)) return;
      for (let p = o; p; p = p.parent) if (p.userData?.row) return;
      o.geometry.computeBoundingBox();
      const b = o.geometry.boundingBox.clone().applyMatrix4(o.matrixWorld);
      const touchesPlane = (b.min.z <= -1.88 && b.max.z > -2.1 && b.max.z < 0.5) || (b.max.z >= 1.88 && b.min.z < 2.1 && b.min.z > -0.5); // reaches the plane (not wholly behind it)
      if (touchesPlane && b.max.x > -14.2 && b.min.x < 7.7 && b.max.y > 0.5) out.push(nm);
    });
    return out;
  });
  check('street: nothing at the camera planes is left out of its row', bad.length === 0, bad.slice(0, 4).join(', '));
  await sctx.close();
}

// 5. The key that begins a run is not also his first jump: holding Space to begin Ludlow St used to launch him off the doorstep the moment he had control
// (the street and the deli start standing, so control comes at once). Let go and press again, and he jumps.
{
  const jctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const jp = await jctx.newPage();
  jp.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await jp.goto(URL.replace('?test', '?test&level=street'));
  await jp.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 90000 });
  const rise = async (ms) => { let top = -9, lo = 99; const t0 = Date.now(); while (Date.now() - t0 < ms) { const y = await jp.evaluate(() => window.__hue.runtime.feet.y); top = Math.max(top, y); lo = Math.min(lo, y); await jp.waitForTimeout(30); } return top - lo; };
  await jp.keyboard.down('Space');
  const held = await rise(900);
  await jp.keyboard.up('Space');
  await jp.waitForTimeout(500);
  await jp.keyboard.down('Space');
  const again = await rise(700);
  await jp.keyboard.up('Space');
  check('holding Space to begin does not make him jump', held < 0.05, `rose ${held.toFixed(3)} m while the begin key was held`);
  check('pressing it again does', again > 0.4, `rose ${again.toFixed(3)} m`);
  // ... and the Space that resumes a paused game is not a jump either.
  await jp.waitForTimeout(1500);
  await jp.keyboard.press('Escape');
  await jp.waitForFunction(() => window.__hue.useGame.getState().paused, null, { timeout: 3000 });
  await jp.keyboard.down('Space');
  const resumed = await rise(800);
  await jp.keyboard.up('Space');
  check('the Space that resumes a paused game does not make him jump', resumed < 0.05 && !(await jp.evaluate(() => window.__hue.useGame.getState().paused)), `rose ${resumed.toFixed(3)} m`);
  await jctx.close();
}

// 7. Quality tiers (desktop effects): each tier loads and runs without errors, `?quality=` is not moved by the frame-rate monitor, and unforced the tiers step down one at a time and
// back up (before the resolution is touched).
{
  for (const q of [0, 1, 2]) {
    const qctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
    const qp = await qctx.newPage();
    const qerr = [];
    qp.on('pageerror', (e) => qerr.push(e.message));
    qp.on('console', (m) => { if (m.type() === 'error') qerr.push(m.text().slice(0, 120)); });
    await qp.goto(URL.replace('?test', `?test&quality=${q}`));
    await qp.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 90000 });
    await qp.waitForTimeout(800);
    const r = await qp.evaluate(() => { const Q = window.__hue.quality; const before = Q.getState().level; const moved = Q.getState().down() || Q.getState().up(); return { before, moved, after: Q.getState().level, canvas: !!document.querySelector('canvas') }; });
    check(`quality ${q}: loads and draws without errors, and the monitor cannot move a forced tier`, r.before === q && !r.moved && r.after === q && r.canvas && qerr.length === 0, `${JSON.stringify(r)} ${qerr.slice(0, 2).join(' | ')}`);
    await qctx.close();
  }
  const uctx = await browser.newContext({ viewport: { width: 1000, height: 640 } });
  const up = await uctx.newPage();
  await up.goto(URL);
  await up.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 90000 });
  const steps = await up.evaluate(() => { const Q = window.__hue.quality.getState(); const out = [Q.level]; out.push(Q.down(), window.__hue.quality.getState().level, Q.down(), window.__hue.quality.getState().level, Q.down(), window.__hue.quality.getState().level); out.push(Q.up(), window.__hue.quality.getState().level, Q.up(), window.__hue.quality.getState().level, Q.up(), window.__hue.quality.getState().level); return out; });
  check('quality steps down 2 > 1 > 0, then says so (the resolution goes next), and back up 0 > 1 > 2', JSON.stringify(steps) === JSON.stringify([2, true, 1, true, 0, false, 0, true, 1, true, 2, false, 2]), JSON.stringify(steps));
  await uctx.close();
}

// 8. A model that cannot be downloaded (a bad connection) ends in a plain message with a reload button, not a loading bar that never finishes or the framework's own error page.
{
  const ectx = await browser.newContext({ viewport: { width: 900, height: 560 } });
  const ep = await ectx.newPage();
  await ep.route(/\.glb(\?|$)/, (r) => r.abort()); // (the models' addresses carry ?v=<deploy>)
  await ep.goto(URL.replace('?test', '?level=home'));
  const shown = await ep.getByText('the game could not load', { exact: false }).first().waitFor({ timeout: 20000 }).then(() => true, () => false);
  const btn = shown && (await ep.locator('button.ui-cta', { hasText: /reload/i }).count()) === 1;
  const text = (await ep.locator('body').innerText()).toLowerCase();
  check('a model that cannot be downloaded shows a plain message and a reload button', shown && btn && !text.includes("this page couldn't load") && !text.includes('this page couldn’t load'), `shown ${shown}, button ${btn}, ` + text.replace(/\s+/g, ' ').slice(0, 100));
  await ectx.close();
}

// 6. Every coin that sits on something (not floating high above it, for a jump or a bounce) has room for Hue to stand within pick-up distance: the street's north-ledge
// coin was 6 cm too far under a fire-escape deck, nobody could pick it up, and the level could not be won. (npm run test:reach proves the whole route; this names the coin.)
for (const level of ['home', 'street', 'deli']) {
  const cctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
  const cp = await cctx.newPage();
  cp.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  await cp.goto(URL.replace('?test', `?test&level=${level}`));
  await cp.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 90000 });
  const stuck = await cp.evaluate(() => {
    const H = window.__hue, R = 0.06, HEIGHT = 0.455, PICK = 0.14;
    const cols = H.colliders.filter((c) => !c.userData.ladder && !c.userData.retired && !c.userData.door);
    const inside = (c, x, y, z) => Math.abs(x - c.center.x) <= c.halfExtents.x + 1e-6 && Math.abs(y - c.center.y) <= c.halfExtents.y + 1e-6 && Math.abs(z - c.center.z) <= c.halfExtents.z + 1e-6;
    // is the column of the capsule (radius R, feet at y) around (x, z) free of colliders, ignoring the one he stands on?
    const clear = (x, z, y) => {
      for (const c of cols) {
        const top = c.center.y + c.halfExtents.y, bot = c.center.y - c.halfExtents.y;
        if (top <= y + 0.03 || bot >= y + HEIGHT) continue; // below his feet, or above his head
        if (Math.abs(x - c.center.x) < c.halfExtents.x + R && Math.abs(z - c.center.z) < c.halfExtents.z + R) return false;
      }
      return true;
    };
    const out = [];
    H.scene.updateMatrixWorld(true);
    H.scene.traverse((o) => {
      const nm = o.userData?.name ?? o.name;
      if (!/^COIN_\d+$/.test(nm)) return;
      const p = o.getWorldPosition(new o.position.constructor());
      // what he could stand on and still pick it up: a collider top within reach of the coin (his capsule spans feet + 0.06 to feet + 0.40, so the top is 0.06 to 0.40 below it)
      const floors = new Set();
      for (const c of cols) { const top = c.center.y + c.halfExtents.y; if (top <= p.y - 0.06 + 1e-6 && top >= p.y - 0.40 && Math.abs(p.x - c.center.x) < c.halfExtents.x + PICK && Math.abs(p.z - c.center.z) < c.halfExtents.z + PICK) floors.add(+top.toFixed(3)); }
      if (!floors.size) return; // floating: reached by a jump, not a stand
      let ok = false;
      for (const floor of floors) for (let a = 0; a < 16 && !ok; a++) for (const r of [0, 0.05, 0.1, 0.13]) { const x = p.x + Math.cos((a * Math.PI) / 8) * r, z = p.z + Math.sin((a * Math.PI) / 8) * r; if (clear(x, z, floor)) { ok = true; break; } }
      if (!ok) out.push(`${nm} at ${[p.x, p.y, p.z].map((v) => v.toFixed(2))}`);
    });
    return out;
  });
  check(`${level}: every coin that sits on something has room for Hue to stand within pick-up distance`, stuck.length === 0, stuck.join('; '));
  await cctx.close();
}

console.log(errors.length ? '\nbrowser errors:\n' + [...new Set(errors)].join('\n') : '\nno browser errors');
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
await browser.close();
process.exit(results.every(Boolean) && !errors.length ? 0 : 1);
