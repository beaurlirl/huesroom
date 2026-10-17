// Scratch: what the player sees when the level's model cannot be downloaded.
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 900, height: 560 } })).newPage();
const errs = [];
page.on('pageerror', (e) => errs.push('pageerror: ' + e.message.slice(0, 120)));
await page.route(/\.glb(\?|$)/, (r) => r.abort());
await page.goto('http://localhost:3100/?level=home');
await page.waitForTimeout(Number(process.argv[2] ?? 9000));
console.log('visible text:', JSON.stringify((await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 300)));
console.log('errors:', errs.slice(0, 3));
if (process.argv[3]) await page.screenshot({ path: process.argv[3] });
await browser.close();
