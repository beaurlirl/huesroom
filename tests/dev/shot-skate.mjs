// Scratch: screenshots of the skate yard (ridden down the screen) at moments of a scripted run (virtual time, drawing on). node tests/dev/shot-skate.mjs <outDir>
import { open, begin } from '../vt.mjs';
const out = process.argv[2] ?? '.';
const W = Number(process.env.W ?? 1100), H = Number(process.env.H ?? 640);
const { browser, page, errors } = await open({ level: 'skate-yard', viewport: { width: W, height: H } });
await begin(page);
await page.evaluate(() => { window.__vt.manual = true; });
const step = (n, input, dt = 1 / 60) => page.evaluate(([n, input, dt]) => {
  const R = window.__hue.runtime;
  for (let i = 0; i < n; i++) { R.debug.input = input(i, R); window.__vt.frame(dt); }
}, [n, input, dt]);
const shot = async (name) => { await page.waitForTimeout(150); await page.screenshot({ path: `${out}/${name}.png` }); };
await page.evaluate(() => { const D = window.__hue.runtime.debug; D.input = { x: 0, z: 0, run: false, jump: false }; D.teleport(0, 0, -1.6, 90); window.__vt.frame(1 / 60); D.skateSpeed(2.2); });
// Moments: rolling, over the kerb, the kicker, on the rail.
const moments = [['1-rolling', 1.8], ['2-over-kerb', 3.3], ['3-kicker-air', 6.2], ['4-grind', 9.0], ['5-barrier', 11.6]];
const pops = [2.5, 7.2, 10.85];
await page.evaluate(([pops]) => { window.__pops = pops; window.__next = 0; }, [pops]);
for (const [name, x] of moments) {
  for (let guard = 0; guard < 600; guard++) {
    const at = await page.evaluate(([x]) => {
      const R = window.__hue.runtime;
      const s = -R.feet.z;
      const pop = window.__next < window.__pops.length && s > window.__pops[window.__next] && R.debug.mode === 'ground';
      if (pop) window.__next++;
      R.debug.input = { x: 0, z: -1, run: false, jump: false, pop };
      window.__vt.frame(1 / 60);
      return -R.feet.z >= x;
    }, [x]);
    if (at) break;
  }
  await shot(name);
}
console.log('errors', errors);
await browser.close();
