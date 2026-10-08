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
    let maxY = -1, maxClimbV = 0;
    const hist = [];
    const t0 = performance.now();
    const iv = setInterval(() => {
      maxY = Math.max(maxY, r.feet.y);
      if (trace.length < 400) trace.push(d.mode);
      // Climb smoothness: the hop over a lip must pick up where the climb loop left off (it once jumped 0.28 -> 2.5 m/s).
      // Speed over an ~80 ms window, since timers fire off the frame clock.
      const now = performance.now();
      hist.push({ t: now, y: r.feet.y });
      while (hist.length > 1 && now - hist[1].t >= 80) hist.shift();
      if (d.mode === 'climb' && now - hist[0].t >= 70) maxClimbV = Math.max(maxClimbV, (r.feet.y - hist[0].y) / ((now - hist[0].t) / 1000));
    }, 16);
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
    return { end: [f.x, f.y, f.z].map((v) => +v.toFixed(3)), maxY: +maxY.toFixed(2), maxClimbV: +maxClimbV.toFixed(2), modes };
  }, leg);
  const reached = leg.expectY === null ? res.maxY > 1.2 : Math.abs(res.end[1] - leg.expectY) < 0.03;
  const smooth = res.maxClimbV <= 1.6; // m/s; the loop climbs at 0.28 and the hop peaks near 1.3 (the old burst read 2.0)
  const ok = reached && smooth;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${leg.name.padEnd(44)} end y=${res.end[1].toFixed(3)} (want ${leg.expectY})  at [${res.end}]  peak ${res.maxY}  ${res.maxClimbV ? `climb ${res.maxClimbV} m/s  ` : ''}${res.modes}`);
  if (leg.shot) await page.screenshot({ path: `${process.env.S}/route-${leg.shot}.png` });
}
await browser.close();
