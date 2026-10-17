// How long the camera's sight map takes to build, in real time on this machine (slices of 3 ms per frame).
import { chromium } from 'playwright-core';
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
for (const cpu of [1, 4]) {
  const ctx = await browser.newContext({ viewport: { width: 1000, height: 600 } });
  const page = await ctx.newPage();
  const cdp = await ctx.newCDPSession(page);
  await cdp.send('Emulation.setCPUThrottlingRate', { rate: cpu });
  const t0 = Date.now();
  await page.goto('http://localhost:3100/?level=deli&test');
  await page.waitForFunction(() => window.__sight?.grid?.ready, null, { timeout: 180000 });
  const r = await page.evaluate(() => { const g = window.__sight.grid; return { buildMs: +g.buildMs.toFixed(0), cells: g.data.length, dims: [g.nx, g.ny, g.nz] }; });
  console.log(`CPU x${cpu} slower: sight map ready ${Date.now() - t0} ms after the page started; rasterising took ${r.buildMs} ms in total; ${r.cells} cells ${r.dims}`);
  await ctx.close();
}
await browser.close();
