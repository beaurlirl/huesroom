// Level 2 (Ludlow St) rules that the route legs don't cover: coin count, spawn, camera flip, haze, ladders, row hiding, kerb walk.
// Run with the dev server up: npx next dev -p 3100, then: node tests/street.mjs
import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto('http://localhost:3100/?debug&level=street');
await page.waitForFunction(() => { const g = window.__hue?.useGame.getState(); return g?.phase === 'ready' && g.sceneReady; }, null, { timeout: 120000 });
let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); if (!ok) fails++; };
const info = await page.evaluate(() => {
  const h = window.__hue, r = h.runtime; let haze = 0, ladders = 0, rowW = 0, rowE = 0, coins = 0;
  h.scene.traverse((o) => { if (o.userData?.haze) haze++; if (o.userData?.row === 'W') rowW++; if (o.userData?.row === 'E') rowE++; if (/^COIN_\d+$/.test(o.name)) coins++; });
  for (const c of h.colliders ?? []) if (c.userData?.ladder) ladders++;
  return { total: h.useGame.getState().totalCoins, coins, haze, ladders, rowW, rowE, feet: r.feet.toArray().map((v) => +v.toFixed(2)), camY: +r.cameraPos.y.toFixed(2) };
});
check('street loads and counts its coins', info.total === info.coins && info.total >= 18, `(total ${info.total}, COIN nodes ${info.coins})`);
check('every fire escape / ledge has a ladder collider', info.ladders >= 6, `(${info.ladders})`);
check('far street nodes are flagged for haze', info.haze >= 3, `(${info.haze})`);
check('both rows are tagged for the camera flip', info.rowW > 20 && info.rowE > 10, `(W ${info.rowW}, E ${info.rowE})`);
check('Hue starts on the doorstep of 87, camera low', Math.abs(info.feet[0] - (-1.99)) < 0.2 && info.feet[2] < -1.5 && info.camY < 0.8, `(feet ${info.feet}, cam y ${info.camY})`);
await page.keyboard.press('Space');
await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'playing', null, { timeout: 10000 });
const walk = await page.evaluate(async () => {
  const r = window.__hue.runtime, d = r.debug; const sleep = (ms) => new Promise((x) => setTimeout(x, ms)); const out = {};
  d.teleport(-1.99, 0.19, -1.83, 0); d.input = { x: 0, z: 1, run: true, jump: false };            // off the doorstep, over the kerb, into the road
  await sleep(2600); out.road = { y: +r.feet.y.toFixed(2), z: +r.feet.z.toFixed(2), camY: +r.cameraPos.y.toFixed(2), side: r.camSide };
  await sleep(2600); out.east = { y: +r.feet.y.toFixed(2), z: +r.feet.z.toFixed(2), side: r.camSide, flip: +r.camFlip.toFixed(2) };   // across the centre line, over the east kerb
  d.input = null; await sleep(800);
  let hiddenW = 0, hiddenE = 0; window.__hue.scene.traverse((o) => { if (o.userData?.row === 'W' && !o.visible) hiddenW++; if (o.userData?.row === 'E' && !o.visible) hiddenE++; });
  out.hidden = { hiddenW, hiddenE }; return out;
});
check('walks off the doorstep and over the west kerb into the road', walk.road.z > -1.1 && walk.road.y < 0.05, JSON.stringify(walk.road));
check('the camera rose as Hue left the step', walk.road.camY > 0.8, `(cam y ${walk.road.camY})`);
check('crossing the centre line flips the camera and Hue climbs the east kerb', walk.east.side === -1 && walk.east.flip > 0.99 && walk.east.z > 1.15, JSON.stringify(walk.east));
check('while the camera is on the west line, the west row is hidden (not the east)', walk.hidden.hiddenW > 10 && walk.hidden.hiddenE === 0, JSON.stringify(walk.hidden));
// Getting over the top of a ladder plays the climb_top clip, and the root lands exactly on the deck (85's ladder from the shop sign, deck at 1.95).
const top = await page.evaluate(async () => {
  const r = window.__hue.runtime, d = r.debug; const sleep = (ms) => new Promise((x) => setTimeout(x, ms));
  d.teleport(-5.2, 1.29, -1.73, 180); await sleep(800); d.input = { x: 0, z: -1, run: false, jump: false };
  let played = false, maxJump = 0, last = r.feet.y; const t0 = performance.now();
  while (performance.now() - t0 < 20000) { await sleep(40); if (d.anim?.current === 'climb_top') played = true; maxJump = Math.max(maxJump, Math.abs(r.feet.y - last)); last = r.feet.y; if (played && d.anim?.current !== 'climb_top' && r.feet.y > 1.9) break; }
  d.input = null; await sleep(600);
  return { played, y: +r.feet.y.toFixed(3), maxJump: +maxJump.toFixed(3), mode: d.mode };
});
check('top of a ladder plays climb_top and lands on the deck', top.played && Math.abs(top.y - 1.95) < 0.03 && top.maxJump < 0.06, JSON.stringify(top));
check('no page errors', errors.length === 0, errors.slice(0, 2).join(' | '));
await browser.close();
process.exit(fails ? 1 : 0);
