import { chromium, devices } from 'playwright-core';
const URL = process.env.URL || 'http://localhost:3100/?test';
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist','--autoplay-policy=no-user-gesture-required'] });
const results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok, detail }); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const errors = [];

const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 } });
const page = await ctx.newPage();
page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
page.on('requestfailed', (r) => errors.push('requestfailed: ' + r.url()));
page.on('response', (r) => { if (r.status() >= 400) errors.push(`HTTP ${r.status()}: ${r.url()}`); });

await page.goto(URL);
await page.waitForFunction(() => window.__hue?.useGame.getState().phase === 'intro', null, { timeout: 60000 });

// Pose monitor: every frame, hips/head vs feet, and root visibility.
await page.evaluate(() => {
  const h = window.__hue;
  const hips = h.scene.getObjectByName('mixamorigHips');
  const head = h.scene.getObjectByName('mixamorigHeadTop_End');
  const v = new (hips.position.constructor)();
  h.poseLog = { minHead: 9, maxHead: -9, minHips: 9, samples: 0, badFrames: [] };
  const tick = () => {
    const mode = h.runtime.debug.mode, phase = h.useGame.getState().phase;
    const feet = h.runtime.feet;
    const hy = hips.getWorldPosition(v).y - feet.y;
    const top = head.getWorldPosition(v).y - feet.y;
    const upright = !['climb', 'land', 'ladder', 'air'].includes(mode) && ['playing', 'won'].includes(phase);
    const L = h.poseLog;
    L.samples++;
    if (hy < -0.03) L.badFrames.push(`hips below feet ${hy.toFixed(3)} ${phase}/${mode}`);
    if (upright) { L.minHead = Math.min(L.minHead, top); L.maxHead = Math.max(L.maxHead, top); L.minHips = Math.min(L.minHips, hy); }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
});

const state = () => page.evaluate(() => { const h = window.__hue, g = h.useGame.getState(); return { phase: g.phase, collected: g.collected, paused: g.paused, elapsed: +h.runtime.elapsed.toFixed(2), feet: h.runtime.feet.toArray().map((v) => +v.toFixed(3)) }; });

// 1. No control before begin.
const s0 = await state();
await page.keyboard.down('KeyW'); await page.waitForTimeout(600); await page.keyboard.up('KeyW');
let s1 = await state();
check('no movement during intro', JSON.stringify(s0.feet) === JSON.stringify(s1.feet) && s1.phase !== 'playing', `phase ${s1.phase}`);
await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'ready', null, { timeout: 10000 });
check('title → begin prompt', (await page.getByText('press any key').isVisible()));

// 2. Begin → rise (locked) → control; timer starts then.
await page.keyboard.press('Space');
await page.waitForTimeout(100);
s1 = await state();
check('begin starts the rise', s1.phase === 'rising', s1.phase);
await page.keyboard.down('KeyS'); await page.waitForTimeout(800);
const s2 = await state();
check('input locked while rising', JSON.stringify(s1.feet) === JSON.stringify(s2.feet) && s2.elapsed === 0, `elapsed ${s2.elapsed}`);
await page.keyboard.up('KeyS');
await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'playing', null, { timeout: 5000 });
await page.waitForTimeout(500);
const s3 = await state();
check('timer running once playing', s3.elapsed > 0.3 && s3.elapsed < 1.5, `elapsed ${s3.elapsed}`);
check('audio clips loaded', (await page.evaluate(() => window.__hue.audio.loadedClips().sort().join(','))) === 'boing,chime,thud,win', await page.evaluate(() => window.__hue.audio.loadedClips().join(',')));

// 3. Real keyboard play: walk toward the camera and right, off the table, onto coin 01.
await page.keyboard.down('KeyS'); await page.keyboard.down('KeyD');
await page.waitForTimeout(1300);
await page.keyboard.up('KeyD');
await page.waitForTimeout(900);
await page.keyboard.up('KeyS');
await page.waitForTimeout(400);
let s4 = await state();
if (s4.collected === 0) { // steer to coin 01 at (0.15, 1.18)
  for (let i = 0; i < 12 && (await state()).collected === 0; i++) {
    const f = (await state()).feet; const dx = 0.15 - f[0], dz = 1.18 - f[2];
    const keys = [dx > 0.03 ? 'KeyD' : dx < -0.03 ? 'KeyA' : null, dz > 0.03 ? 'KeyS' : dz < -0.03 ? 'KeyW' : null].filter(Boolean);
    for (const k of keys) await page.keyboard.down(k);
    await page.waitForTimeout(250);
    for (const k of keys) await page.keyboard.up(k);
  }
  s4 = await state();
}
check('keyboard play collects coin 01', s4.collected >= 1, `feet ${s4.feet} collected ${s4.collected}`);


// Jump with Space on the floor.
const beforeJump = await state();
await page.keyboard.down('Space');
let peak = 0;
for (let i = 0; i < 45; i++) { await page.waitForTimeout(20); peak = Math.max(peak, (await state()).feet[1]); }
await page.keyboard.up('Space');
await page.waitForTimeout(600);
check('Space jumps ~0.6 m', peak - beforeJump.feet[1] > 0.45 && peak - beforeJump.feet[1] < 0.7, `rise ${(peak - beforeJump.feet[1]).toFixed(2)} m`);

// 4. Pause freezes the timer; Esc resumes.
await page.keyboard.press('Escape');
const p0 = await state(); await page.waitForTimeout(700); const p1 = await state();
check('Esc pauses, timer frozen', p0.paused && p1.elapsed === p0.elapsed, `paused ${p0.paused} ${p0.elapsed}→${p1.elapsed}`);

await page.keyboard.press('Escape');
await page.waitForTimeout(300);
check('Esc resumes', !(await state()).paused && (await state()).elapsed > p1.elapsed);
await page.keyboard.press('KeyP'); await page.waitForTimeout(100);
check('P pauses', (await state()).paused);
await page.keyboard.press('KeyP'); await page.waitForTimeout(100);

// 4b. Restart while airborne must not block jumping next run (review finding).
await page.keyboard.press('Space');
await page.waitForTimeout(80);
await page.keyboard.press('KeyR');
await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'ready', null, { timeout: 10000 });
await page.keyboard.press('Space');
await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'playing', null, { timeout: 5000 });
await page.waitForTimeout(300);
{
  const y0 = (await state()).feet[1];
  await page.keyboard.down('Space');
  let top = y0;
  for (let i = 0; i < 45; i++) { await page.waitForTimeout(20); top = Math.max(top, (await state()).feet[1]); }
  await page.keyboard.up('Space');
  await page.waitForTimeout(600);
  check('can jump after restarting mid-air', top - y0 > 0.4, `rise ${(top - y0).toFixed(2)} m`);
}

// 5. R restarts mid-run: coins back, books back, Hue seated, timer 0, intro again.
await page.evaluate(() => { const b = [...window.__hue.books][0]; b.setTranslation({ x: 0.9, y: 0.05, z: 0.3 }, true); });
await page.keyboard.press('KeyR');
await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'intro', null, { timeout: 3000 });
const r = await page.evaluate(() => ({ collected: window.__hue.useGame.getState().collected, elapsed: window.__hue.runtime.elapsed, feet: window.__hue.runtime.feet.toArray().map((v) => +v.toFixed(3)), book: [...window.__hue.books].map((b) => { const t = b.translation(); return [t.x, t.y, t.z].map((v) => +v.toFixed(2)); }) }));
check('R restart resets run', r.collected === 0 && r.elapsed === 0 && Math.abs(r.feet[1] - 0.4) < 0.01, JSON.stringify(r));
check('restart puts books back', Math.abs(r.book[0][0] - 0.12) < 0.02 && Math.abs(r.book[0][2] - 0.415) < 0.02, JSON.stringify(r.book));

// 6. Win twice (teleport) → best time kept, persists across reload.
const coins = [[0.15,0.18,1.18],[0.675,0.843,-0.942],[0.07,0.577,0.23],[-0.735,1.173,0.94],[-0.735,0.69,-0.23],[-0.235,0.543,-1.219],[0.88,1.283,-1.422],[1.115,1.702,-0.2],[-0.989,0.69,-1.219],[-0.95,2.158,-1.33],[0.809,2.3,1.12]];
async function winRun(delay) {
  await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'ready', null, { timeout: 10000 });
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'playing', null, { timeout: 5000 });
  await page.waitForTimeout(delay);
  for (const [x, y, z] of coins) { await page.evaluate(([x, y, z]) => window.__hue.runtime.debug.teleport(x, y - 0.25, z, -90), [x, y, z]); await page.waitForTimeout(120); }
  await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'won', null, { timeout: 5000 });
  return page.evaluate(() => window.__hue.useGame.getState().result);
}
const w1 = await winRun(300);
await page.waitForTimeout(500);
const frozen = await state(); await page.waitForTimeout(500);
check('win freezes timer and input', (await state()).elapsed === frozen.elapsed && frozen.phase === 'won');
check('win panel shows', await page.getByRole('button', { name: 'Play again' }).isVisible());
await page.getByRole('button', { name: 'Play again' }).click();
const w2 = await winRun(2500);
check('best time kept when slower', !w2.isBest && Math.abs(w2.best - w1.time) < 1e-6, `run1 ${w1.time.toFixed(2)} run2 ${w2.time.toFixed(2)} best ${w2.best.toFixed(2)}`);
const pose = await page.evaluate(() => window.__hue.poseLog);
check('Hue never underground / sideways', pose.badFrames.length === 0 && pose.minHead > 0.38 && pose.maxHead < 0.5 && pose.minHips > 0.15,
  `head ${pose.minHead.toFixed(3)}–${pose.maxHead.toFixed(3)} m, min hips ${pose.minHips.toFixed(3)} m over ${pose.samples} frames, bad ${pose.badFrames.slice(0, 3).join('; ')}`);
await page.reload();
await page.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 60000 });
const best = await page.evaluate(() => localStorage.getItem('huesroom.best'));
check('best time persists across reload', Math.abs(Number(best) - w1.time) < 1e-6, `stored ${best}`);
check('no touch controls on desktop', (await page.getByRole('button', { name: 'Jump' }).count()) === 0);

await ctx.close();

// 7. Phone: touch controls visible during play, hidden on title.
const mctx = await browser.newContext({ ...devices['iPhone 13'] });
const mp = await mctx.newPage();
mp.on('pageerror', (e) => errors.push('mobile pageerror: ' + e.message));
await mp.goto(URL);
await mp.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 60000 });
const titleVisible = await mp.evaluate(() => getComputedStyle(document.querySelector('button[aria-label="Jump"]').parentElement).opacity);
check('touch prompt says tap to begin', await mp.getByText('tap to begin').isVisible());
await mp.touchscreen.tap(190, 300);
await mp.waitForFunction(() => window.__hue.useGame.getState().phase === 'playing', null, { timeout: 10000 });
await mp.waitForTimeout(400);
const playVisible = await mp.evaluate(() => getComputedStyle(document.querySelector('button[aria-label="Jump"]').parentElement).opacity);
check('touch controls hidden on title, shown in play', titleVisible === '0' && playVisible === '1', `title ${titleVisible} play ${playVisible}`);
const bloomOff = await mp.evaluate(() => window.__hue.gl.getPixelRatio());
check('phone pixel ratio capped at 1.5', bloomOff <= 1.5, `${bloomOff}`);
await mctx.close();

const realErrors = errors.filter((e) => !/deprecated parameters/.test(e));
check('no console/page/network errors', realErrors.length === 0, realErrors.slice(0, 5).join(' | '));
console.log(`\n${results.filter((r) => r.ok).length}/${results.length} checks passed`);
await browser.close();
