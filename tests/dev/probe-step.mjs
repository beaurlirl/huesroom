// Scratch: replay the recorded route up to step N, then log every few frames of step N: where the camera and Hue are, what the camera is doing.
//   node tests/probe-step.mjs <level> <step> [every=2]
import fs from 'fs';
import { open, begin, takeClock } from '../vt.mjs';
import { ACTIONS, DT, installSim } from '../reach-sim.mjs';
const [level, stepArg, everyArg] = process.argv.slice(2);
const N = Number(stepArg), every = Number(everyArg ?? 2);
const tour = JSON.parse(fs.readFileSync(new URL(`../reach/${level}.json`, import.meta.url)));
const { browser, page } = await open({ level });
await begin(page); await takeClock(page); await page.evaluate(installSim, { DT, ACTIONS });
const rows = await page.evaluate(({ steps, N, every }) => {
  const X = window.__simx, R = window.__hue.runtime, S = window.__sight, h = window.__hue, out = [];
  for (let i = 0; i < N; i++) { const s = steps[i]; X.perform({ x: s.from[0], y: s.from[1], z: s.from[2] }, s.act); }
  const orig = window.__vt.frame; let n = 0;
  const f2 = (v) => +v.toFixed(2);
  window.__vt.frame = (dt) => { orig(dt); if (++n % every === 0) { const st = S.rig; out.push({ n, feet: R.feet.toArray().map(f2), cam: R.cameraPos.toArray().map(f2), shot: st.shot ? st.shot.pos.join(',') : null, sw: f2(st.shotW), aim: st.sightAim ? st.sightAim.toArray().map(f2) : null, off: st.sightOff.toArray().map(f2), sees: S.seesHue(S.grid, R.cameraPos.x, R.cameraPos.y, R.cameraPos.z, R.feet, S.cutaway ? 1 : 3) }); } };
  const s = steps[N]; X.perform({ x: s.from[0], y: s.from[1], z: s.from[2] }, s.act);
  for (let i = 0; i < 80; i++) window.__vt.frame(1 / 32);
  window.__vt.frame = orig;
  return out;
}, { steps: tour.steps, N, every });
for (const r of rows) console.log(r.n, 'Hue', r.feet.join(','), 'cam', r.cam.join(','), 'shot', r.shot, 'w', r.sw, 'aim', r.aim?.join(','), 'off', r.off.join(','), r.sees ? 'sees' : 'BLIND');
await browser.close();
