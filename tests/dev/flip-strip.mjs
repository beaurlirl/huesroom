// Scratch: screenshots across the street's camera flip. Hue walks over the centre line; a picture is taken every <ms> after he crosses it.
//   node tests/dev/flip-strip.mjs <out-prefix> <interval ms> <count>
import { chromium } from 'playwright-core';
const [prefix, every = '300', count = '6'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 760, height: 460 } })).newPage();
await page.goto('http://localhost:3100/?level=street&test');
await page.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 90000 });
await page.keyboard.press('Shift');
await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'playing');
await page.evaluate(() => window.__hue.runtime.debug.teleport(-3, 0.1, -1.3, 90));
await page.waitForTimeout(3500);
await page.evaluate(() => { window.__hue.runtime.debug.input = { x: 0, z: 1, run: false, jump: false }; });
await page.waitForFunction(() => window.__hue.runtime.feet.z > 0.14, null, { timeout: 15000, polling: 16 });
const t0 = Date.now();
for (let i = 0; i < Number(count); i++) {
  const wait = i * Number(every) - (Date.now() - t0);
  if (wait > 0) await page.waitForTimeout(wait);
  await page.screenshot({ path: `${prefix}-${i}.jpg`, type: 'jpeg', quality: 70 });
}
await page.evaluate(() => { window.__hue.runtime.debug.input = null; });
await browser.close();
