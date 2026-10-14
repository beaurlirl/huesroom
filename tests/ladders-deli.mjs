// The deli's ladders, climbed with REAL key presses (the keys turn with the camera), holding one key the way a player does. However the camera swings while he is on
// the ladder, a held key must keep meaning "toward the ladder": he climbs to the top and never stops half way or climbs back down.
// Needs the dev server:  npx next dev -p 3100     then:  node tests/ladders-deli.mjs
import { chromium } from 'playwright-core';
const URL = process.env.URL || 'http://localhost:3100/?level=deli&test';
const TRIES = +(process.env.TRIES || 4);
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.setDefaultTimeout(240000);
await page.goto(URL);
await page.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 90000 });
await page.keyboard.press('Shift');
await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'playing');

// [name, feet at the ladder's foot, the way up (world x,z), the height of the top]
const LADDERS = [
  ['chip shelf (staff aisle)', [1.76, 0.02, 1.7], [0, -1], 1.56],
  ['chip rack (by the ATM)', [-2.67, 0.02, -1.62], [0, -1], 1.51],
  ['median shelf (customer aisle)', [-1.69, 0.02, 0.5], [0, -1], 1.86],
  ['cold run (left aisle)', [0.06, 0.02, -1.45], [0, -1], 1.69],
];
// The key a player would press for a direction on the ground, given how the camera is turned right now (the key whose way on screen is closest to it).
const keyFor = (cy, d) => {
  const c = [['KeyW', 0, 1], ['KeyS', 0, -1], ['KeyD', 1, 0], ['KeyA', -1, 0]].map(([k, mx, mz]) => [k, -Math.sin(cy) * mz + Math.cos(cy) * mx, -Math.cos(cy) * mz - Math.sin(cy) * mx]);
  c.sort((a, b) => b[1] * d[0] + b[2] * d[1] - (a[1] * d[0] + a[2] * d[1]));
  return c[0][0];
};

let failed = 0, total = 0;
for (const [name, start, up, top] of LADDERS) {
  const outcomes = [];
  for (let t = 0; t < TRIES; t++) {
    await page.evaluate(([s]) => { window.__hue.runtime.debug.input = null; window.__hue.runtime.debug.teleport(s[0], s[1], s[2], 90); }, [start]);
    await page.waitForTimeout(1200 + ((t * 530) % 2600)); // the camera is in a different phase each try
    const cy = await page.evaluate(() => window.__hue.runtime.moveYaw);
    const key = keyFor(cy, up);
    await page.keyboard.down(key);
    let maxY = 0, lastY = 0, flatSince = null, outcome = 'did not reach the top';
    for (let i = 0; i < 90; i++) {
      await page.waitForTimeout(150);
      const y = await page.evaluate(() => window.__hue.runtime.feet.y);
      if (y > 0.1 && Math.abs(y - lastY) < 0.004 && y < top - 0.2) { flatSince ??= i; if (i - flatSince > 12) { outcome = 'STUCK half way up'; break; } } else flatSince = null;
      maxY = Math.max(maxY, y);
      lastY = y;
      if (maxY > 0.12 && y < maxY - 0.25) { outcome = 'CLIMBED BACK DOWN'; break; }
      if (y >= top - 0.1) { outcome = 'ok'; break; }
    }
    await page.keyboard.up(key);
    outcomes.push(`${outcome} (${key}, camera ${(cy * 57.3).toFixed(0)}°)`);
    total++;
    if (outcome !== 'ok') failed++;
  }
  const bad = outcomes.filter((o) => !o.startsWith('ok'));
  console.log(`${bad.length ? 'FAIL' : 'PASS'}  ${name.padEnd(30)} ${bad.length ? bad.join('; ') : `${TRIES}/${TRIES} climbs reached the top`}`);
}
// The far side of a shelf is on the same line as its ladder: walking toward the shelf from there must not pull him through it onto the ladder (it used to snap him to the foot, a "respawn").
// [name, where he stands behind the shelf, the side of this z he must stay on]
const FAR = [
  ['chip shelf, from the gap behind it', [1.75, 0.02, 0.4], (z) => z < 0.6],
  ['median shelf, from the left aisle behind it', [-1.69, 0.02, -0.95], (z) => z < -0.5],
];
for (const [name, start, stays] of FAR) {
  await page.evaluate(([s]) => { window.__hue.runtime.debug.input = null; window.__hue.runtime.debug.teleport(s[0], s[1], s[2], 90); }, [start]);
  await page.waitForTimeout(800);
  const r = await page.evaluate(async () => {
    const R = window.__hue.runtime, sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    R.debug.input = { x: 0, z: -1, run: false, jump: false };
    let maxY = 0, maxZ = -99;
    for (let i = 0; i < 7; i++) { await sleep(100); maxY = Math.max(maxY, R.feet.y); maxZ = Math.max(maxZ, R.feet.z); }
    R.debug.input = null;
    return { maxY, maxZ, z: R.feet.z };
  });
  const ok = r.maxY < 0.1 && stays(r.maxZ);
  total++;
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name.padEnd(46)} ${ok ? 'walked on past the shelf, not onto its ladder' : `was pulled onto the ladder (reached y ${r.maxY.toFixed(2)}, z ${r.maxZ.toFixed(2)})`}`);
}
console.log(errors.length ? '\nbrowser errors:\n' + [...new Set(errors)].join('\n') : '\nno browser errors');
console.log(`\n${total - failed}/${total} checks passed`);
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
