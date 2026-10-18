// Scratch: prints the board's path along the yard's lane (u = -z). node tests/dev/probe-skate.mjs <startU> <speed> <frames> [popU]  (IDLE=1 for no stick, EVERY/FROM/TO to thin the rows)
import { open, begin, takeClock } from '../vt.mjs';
const [x0 = '4.3', speed = '2.2', frames = '90', popX = ''] = process.argv.slice(2);
const { browser, page, errors } = await open({ level: 'skate-yard' });
await begin(page);
await takeClock(page);
const rows = await page.evaluate(([x0, speed, frames, popX, idle]) => {
  const R = window.__hue.runtime, D = R.debug;
  D.input = { x: 0, z: 0, run: false, jump: false };
  D.teleport(0, 0, -x0, 90);
  window.__vt.frame(1 / 60);
  D.skateSpeed(+speed);
  const out = [];
  let popped = false;
  for (let i = 0; i < +frames; i++) {
    const pop = popX !== '' && !popped && -R.feet.z > +popX;
    if (pop) popped = true;
    D.input = { x: 0, z: idle ? 0 : -1, run: false, jump: false, pop };
    window.__vt.frame(1 / 60);
    out.push([i, +(-R.feet.z).toFixed(3), +R.feet.y.toFixed(3), +R.skate.speed.toFixed(2), D.mode, R.skate.bumps, R.skate.grinds, window.__hue.useGame.getState().collected, R.skate.bumpedInto ?? '']);
  }
  return out;
}, [x0, speed, frames, popX, !!process.env.IDLE]);
const every = Number(process.env.EVERY ?? 3), from = Number(process.env.FROM ?? 0), to = Number(process.env.TO ?? 1e9);
for (const r of rows.filter((_, i) => i % every === 0 && i >= from && i <= to)) console.log(r.join('\t'));
console.log('errors', errors);
await browser.close();
