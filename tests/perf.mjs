// What a frame costs, level by level: draw calls, triangles on screen, and what is held on the GPU, at spots along each level's recorded route, as a phone
// (touch device: no post-processing, smaller shadow map, lower resolution). Headless Chrome counts the work; it is not a frame rate (there is no phone GPU here).
// (A desktop profile would only count the last post-processing pass: the renderer resets its counters on every render call, and the composer makes several per frame.
// A desktop frame is the phone's scene plus about 20 calls of ambient shading, bloom and smoothing.)
// This is the number to check a new model against (MODEL_BUDGET in the private folder has the limits).
//   node tests/perf.mjs [home street deli]      (dev server on 3100)      LIMITS=1 exits 1 when a phone frame goes over the limits
import fs from 'fs';
import { chromium } from 'playwright-core';

const levels = process.argv.slice(2).length ? process.argv.slice(2) : ['home', 'street', 'deli'];
const SPOTS = 8;
// Per phone frame, at the worst of the sampled spots. Provisional (the owner decides): what a recent phone's Safari can draw at 60 frames a second.
const LIMITS = { calls: 260, triangles: 450_000 };
const CHROME = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
const profiles = {
  phone: { viewport: { width: 844, height: 390 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
};
const rows = [];
for (const level of levels) {
  const file = new URL(`./reach/${level}.json`, import.meta.url);
  const steps = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file)).steps : [];
  const spots = steps.length ? Array.from({ length: SPOTS }, (_, i) => steps[Math.floor((i * (steps.length - 1)) / (SPOTS - 1))].from) : [];
  for (const [name, opts] of Object.entries(profiles)) {
    const ctx = await browser.newContext(opts);
    const page = await ctx.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    const t0 = Date.now();
    await page.goto(`http://localhost:3100/?test&level=${level}`);
    await page.waitForFunction(() => { const g = window.__hue?.useGame.getState(); return g?.phase === 'ready' && g.sceneReady; }, null, { timeout: 120000 });
    const readyMs = Date.now() - t0;
    if (name === 'phone') await page.touchscreen.tap(400, 200); else await page.keyboard.press('Shift');
    await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'playing', null, { timeout: 30000 });
    const samples = [];
    for (const s of spots.length ? spots : [null]) {
      if (s) await page.evaluate(([x, y, z]) => window.__hue.runtime.debug.teleport(x, y, z, 0), s);
      await page.waitForTimeout(1500);
      samples.push(await page.evaluate(() => {
        const i = window.__hue.gl.info;
        return { calls: i.render.calls, triangles: i.render.triangles, geometries: i.memory.geometries, textures: i.memory.textures, programs: i.programs?.length ?? 0 };
      }));
    }
    const heap = await page.evaluate(() => (performance.memory ? Math.round(performance.memory.usedJSHeapSize / 1048576) : null));
    const max = (k) => Math.max(...samples.map((s) => s[k]));
    const med = (k) => samples.map((s) => s[k]).sort((a, b) => a - b)[Math.floor(samples.length / 2)];
    rows.push({ level, profile: name, readyMs, callsMax: max('calls'), callsMed: med('calls'), trisMax: max('triangles'), trisMed: med('triangles'), geometries: max('geometries'), textures: max('textures'), programs: max('programs'), heapMB: heap, errors: [...new Set(errors)].slice(0, 2) });
    await ctx.close();
  }
}
await browser.close();
console.log('level   profile  load ms  draw calls (median/worst)  triangles on screen (median/worst)  geometries  textures  programs  JS heap MB');
for (const r of rows) console.log(r.level.padEnd(7), r.profile.padEnd(8), String(r.readyMs).padEnd(9), `${r.callsMed}/${r.callsMax}`.padEnd(26), `${r.trisMed}/${r.trisMax}`.padEnd(35), String(r.geometries).padEnd(11), String(r.textures).padEnd(9), String(r.programs).padEnd(9), r.heapMB ?? '-', r.errors.length ? ' ERRORS ' + r.errors.join(' | ') : '');
const over = rows.filter((r) => r.profile === 'phone' && (r.callsMax > LIMITS.calls || r.trisMax > LIMITS.triangles));
for (const r of over) console.log(`OVER  ${r.level} on a phone: ${r.callsMax} draw calls (limit ${LIMITS.calls}), ${r.trisMax} triangles (limit ${LIMITS.triangles})`);
if (process.env.LIMITS && over.length) process.exit(1);
