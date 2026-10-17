// Screenshot helper: node tests/dev/shot.mjs <level> <x> <y> <z> <out.png> [settleSeconds]   (x = 'start' leaves him where the run begins; real time, dev server on 3100)
import { chromium } from 'playwright-core';
const [level, x, y, z, out, settle = '3'] = process.argv.slice(2);
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: Number(process.env.W ?? 1100), height: Number(process.env.H ?? 640) } })).newPage();
await page.goto(`http://localhost:3100/?level=${level}&test${process.env.QUALITY ? `&quality=${process.env.QUALITY}` : ""}`);
await page.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 90000 });
await page.keyboard.press('Shift');
await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'playing');
if (x !== 'start') await page.evaluate(([x, y, z]) => window.__hue.runtime.debug.teleport(+x, +y, +z, 0), [x, y, z]);
await page.waitForTimeout(Number(settle) * 1000);
await page.screenshot({ path: out });
const info = await page.evaluate(() => { const R = window.__hue.runtime; return { cam: R.cameraPos.toArray().map((v) => +v.toFixed(2)), feet: R.feet.toArray().map((v) => +v.toFixed(2)) }; });
console.log(JSON.stringify(info));
await browser.close();
