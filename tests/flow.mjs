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

console.log(errors.length ? '\nbrowser errors:\n' + [...new Set(errors)].join('\n') : '\nno browser errors');
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
await browser.close();
process.exit(results.every(Boolean) && !errors.length ? 0 : 1);
