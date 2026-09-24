import { chromium } from 'playwright-core';
const browser = await chromium.launch({
  executablePath: `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
page.on('pageerror', e => console.log('[pageerror]', e.message));
page.on('console', m => { if (m.type() === 'error') console.log('[console.error]', m.text()); });
await page.goto('http://localhost:3100/?debug');
await page.waitForFunction(() => window.__hue?.useGame.getState().phase === 'ready', null, { timeout: 60000 });
await page.keyboard.press('Space');
await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'playing', null, { timeout: 10000 });

const legs = JSON.parse((await import('fs')).readFileSync(process.argv[2] ?? new URL('./routes.json', import.meta.url), 'utf8'));
const only = process.argv[3];
for (const leg of legs) {
  if (only && !leg.name.includes(only)) continue;
  const res = await page.evaluate(async (leg) => {
    const r = window.__hue.runtime, d = r.debug;
    const sleep = (ms) => new Promise((res) => setTimeout(res, ms));
    d.input = { x: 0, z: 0, run: false, jump: false };
    d.teleport(...leg.start);
    await sleep(500);
    const trace = [];
    let maxY = -1;
    const t0 = performance.now();
    const iv = setInterval(() => { maxY = Math.max(maxY, r.feet.y); if (trace.length < 400) trace.push(d.mode); }, 16);
    for (const st of leg.steps) {
      d.input = { x: st.x ?? 0, z: st.z ?? 0, run: !!st.run, jump: !!st.jump };
      await sleep(st.ms);
    }
    d.input = { x: 0, z: 0, run: false, jump: false };
    await sleep(leg.settle ?? 900);
    clearInterval(iv);
    const modes = trace.filter((m, i) => m !== trace[i - 1]).join('>');
    const f = r.feet;
    d.input = null;
    return { end: [f.x, f.y, f.z].map((v) => +v.toFixed(3)), maxY: +maxY.toFixed(2), modes };
  }, leg);
  const ok = leg.expectY === null ? res.maxY > 1.2 : Math.abs(res.end[1] - leg.expectY) < 0.03;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${leg.name.padEnd(44)} end y=${res.end[1].toFixed(3)} (want ${leg.expectY})  at [${res.end}]  peak ${res.maxY}  ${res.modes}`);
  if (leg.shot) await page.screenshot({ path: `${process.env.S}/route-${leg.shot}.png` });
}
await browser.close();
