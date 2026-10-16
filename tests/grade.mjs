// The street's colour grade: on (more saturated than ?raw) on both the desktop and the phone path, and level 1 is left alone.
import { chromium, devices } from 'playwright-core';
import sharp from 'sharp';
const BASE = process.env.BASE ?? 'http://localhost:3100';
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

async function saturation(mode, query, teleport) {
  const ctx = await browser.newContext(mode === 'phone' ? { ...devices['iPhone 13 landscape'] } : { viewport: { width: 1280, height: 600 } });
  await ctx.addInitScript(() => localStorage.setItem('huesroom.seen', '1'));
  const page = await ctx.newPage();
  await page.goto(`${BASE}/?test${query}`, { waitUntil: 'load' });
  await page.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 120000 });
  if (mode === 'phone') await page.touchscreen.tap(200, 200); else await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'playing', null, { timeout: 30000 });
  if (teleport) await page.evaluate((tp) => { const d = window.__hue.runtime.debug; d.input = { x: 0, z: 0, run: false, jump: false }; d.teleport(...tp); }, teleport);
  await page.waitForTimeout(4500);
  const { data, info } = await sharp(await page.screenshot()).resize(320).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  await ctx.close();
  let sum = 0, n = 0;
  for (let y = 40; y < info.height - 40; y++) for (let x = 40; x < info.width - 40; x++) {
    const i = (y * info.width + x) * 3, mx = Math.max(data[i], data[i + 1], data[i + 2]), mn = Math.min(data[i], data[i + 1], data[i + 2]);
    if (mx > 5) { sum += (mx - mn) / mx; n++; }
  }
  return sum / n;
}

const STREET = '&level=street', SPOT = [-4.0, 0.1, -1.55, 90];
for (const mode of ['desktop', 'phone']) {
  const raw = await saturation(mode, STREET + '&raw', SPOT), graded = await saturation(mode, STREET, SPOT);
  check(`street grade lifts saturation (${mode})`, graded >= raw * 1.10, `raw ${raw.toFixed(3)} -> graded ${graded.toFixed(3)} (x${(graded / raw).toFixed(2)})`);
}
const l1raw = await saturation('desktop', '&raw'), l1 = await saturation('desktop', '');
check('level 1 is not graded', Math.abs(l1 - l1raw) / l1raw < 0.06, `${l1raw.toFixed(3)} vs ${l1.toFixed(3)}`);
const custom = await saturation('desktop', STREET + '&grade=0,0,0', SPOT), rawAgain = await saturation('desktop', STREET + '&raw', SPOT);
check('?grade=0,0,0 means no grade', Math.abs(custom - rawAgain) / rawAgain < 0.06, `${custom.toFixed(3)} vs ${rawAgain.toFixed(3)}`);
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
await browser.close();
process.exit(results.every(Boolean) ? 0 : 1);
