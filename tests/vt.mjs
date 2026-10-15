// Virtual time: the real game, stepped frame by frame with a fixed dt, much faster than real time and the same every run.
// requestAnimationFrame and performance.now are replaced before the page loads. The clock follows real time (so the page loads as usual) until a test sets
// __vt.manual = true; then __vt.frame(dt) / __vt.run(n, dt) are the only things that move the game on. fast(true) stops all drawing (and the post-processing
// passes' framebuffer work, which costs far more than the game itself): about 2000 frames a second instead of 400.
// Needs the dev server:  npx next dev -p 3100   (BASE=http://localhost:PORT to use another).
import { chromium } from 'playwright-core';

export const CHROME = `${process.env.HOME}/Library/Caches/ms-playwright/chromium-1234/chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing`;
export const BASE = process.env.BASE || 'http://localhost:3100';

const INIT = () => {
  const realRaf = window.requestAnimationFrame.bind(window);
  const realNow = performance.now.bind(performance);
  let vt = realNow();
  const q = new Map();
  let nid = 1;
  performance.now = () => vt;
  window.requestAnimationFrame = (cb) => { const id = nid++; q.set(id, cb); return id; };
  window.cancelAnimationFrame = (id) => { q.delete(id); };
  const frame = (dt) => {
    vt += dt * 1000;
    const cbs = [...q.values()];
    q.clear();
    for (const cb of cbs) { try { cb(vt); } catch (e) { console.error('frame error', e && e.message); } }
  };
  let last = realNow();
  const loop = (t) => {
    if (!window.__vt.manual) frame(Math.min(0.1, Math.max(0.001, (t - last) / 1000)));
    last = t;
    realRaf(loop);
  };
  window.__vt = { manual: false, frame, get t() { return vt; } };
  realRaf(loop);
};

/** Opens a level in virtual time, loaded and showing the begin prompt. */
export async function open({ level = 'home', viewport = { width: 1280, height: 800 }, extra = '' } = {}) {
  const browser = await chromium.launch({ executablePath: CHROME, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
  const ctx = await browser.newContext({ viewport });
  await ctx.addInitScript(INIT);
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (m.type() === 'error') errors.push('console: ' + m.text()); });
  await page.goto(`${BASE}/?test&level=${level}${extra}`);
  await page.waitForFunction(() => { const g = window.__hue?.useGame.getState(); return g?.phase === 'ready' && g.sceneReady; }, null, { timeout: 120000 });
  return { browser, ctx, page, errors };
}

/** Presses begin and waits for control; installs window.__sim.fast(on). Leaves the clock on real time. */
export async function begin(page) {
  await page.keyboard.press('Space');
  await page.waitForFunction(() => window.__hue.useGame.getState().phase === 'playing', null, { timeout: 90000 });
  await page.evaluate(() => {
    const h = window.__hue;
    const keep = {};
    for (const m of ['render', 'setSize', 'setRenderTarget', 'setViewport', 'setScissor', 'clear', 'setPixelRatio']) keep[m] = h.gl[m].bind(h.gl);
    window.__sim = { fast(on) { for (const m of Object.keys(keep)) h.gl[m] = on ? () => {} : keep[m]; } };
  });
}

/** Hands the clock to the test and stops drawing. */
export const takeClock = (page) => page.evaluate(() => { window.__vt.manual = true; window.__sim.fast(true); });
