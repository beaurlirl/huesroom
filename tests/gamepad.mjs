import { chromium } from 'playwright-core';
const b = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-angle=metal','--enable-gpu','--ignore-gpu-blocklist'] });
const p = await b.newPage({ viewport: { width: 1280, height: 800 } });
p.on('pageerror', e => console.log('[pageerror]', e.message));
// Fake Xbox pad the game reads through navigator.getGamepads().
await p.addInitScript(() => {
  const pad = { connected: true, mapping: 'standard', id: 'Fake Xbox', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) };
  window.__pad = pad;
  navigator.getGamepads = () => [pad];
});
const set = (fn) => p.evaluate(fn);
const press = async (i) => { await p.evaluate((i) => { window.__pad.buttons[i] = { pressed: true, value: 1 }; }, i); await p.waitForTimeout(120); await p.evaluate((i) => { window.__pad.buttons[i] = { pressed: false, value: 0 }; }, i); await p.waitForTimeout(120); };
const st = () => p.evaluate(() => { const h = window.__hue, g = h.useGame.getState(); return { phase: g.phase, paused: g.paused, feet: h.runtime.feet.toArray().map((v) => +v.toFixed(2)) }; });
const check = (name, ok, d) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}  ${d ?? ''}`);
await p.goto(process.env.URL || 'http://localhost:3100/?test');
await p.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 60000 });
check('prompt says press A', await p.getByText('press A to begin').isVisible());
await press(0);
check('A begins', (await st()).phase === 'rising', (await st()).phase);
await p.waitForFunction(() => window.__hue.useGame.getState().phase === 'playing', null, { timeout: 5000 });
const f0 = (await st()).feet;
await set(() => { window.__pad.axes[1] = 1; }); // stick down = toward camera
await p.waitForTimeout(800);
await set(() => { window.__pad.axes[1] = 0; });
await p.waitForTimeout(400);
const f1 = (await st()).feet;
check('left stick moves him', f1[2] - f0[2] > 0.3, `z ${f0[2]} → ${f1[2]}`);
await press(9);
check('Menu pauses', (await st()).paused);
await press(0);
check('A resumes', !(await st()).paused);
await press(8);
await p.waitForTimeout(300);
check('View restarts', ['resetting', 'intro'].includes((await st()).phase), (await st()).phase);
await b.close();
