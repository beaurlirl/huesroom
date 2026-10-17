// Scratch: from a point, how far is it to the first solid cell in a ring of directions (the camera's sight map).
import { chromium } from 'playwright-core';
const [x, y, z] = process.argv.slice(2).map(Number);
const browser = await chromium.launch({ executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await (await browser.newContext({ viewport: { width: 1000, height: 600 } })).newPage();
await page.goto('http://localhost:3100/?level=deli&test');
await page.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 90000 });
await page.waitForTimeout(2500);
const out = await page.evaluate(([x, y, z]) => {
  const g = window.__sight.grid, py = y + 0.25, rows = [];
  for (const eld of [10, 25, 40, 55, 70]) {
    const el = eld * Math.PI / 180, row = [];
    for (let azd = 0; azd < 360; azd += 30) { const az = azd * Math.PI / 180; const ux = Math.cos(az) * Math.cos(el), uy = Math.sin(el), uz = Math.sin(az) * Math.cos(el); const d = g.firstSolid(x, py, z, x + ux * 4, py + uy * 4, z + uz * 4, 0.12, 3); row.push(d === Infinity ? '  >4' : d.toFixed(2).padStart(4)); }
    rows.push(`el ${String(eld).padStart(2)}: ` + row.join(' '));
  }
  return rows;
}, [x, y, z]);
console.log('az:      ' + Array.from({ length: 12 }, (_, i) => String(i * 30).padStart(4)).join(' ') + '   (az 0 = +x east, 90 = +z south, 180 = west, 270 = north)');
console.log(out.join('\n'));
await browser.close();
