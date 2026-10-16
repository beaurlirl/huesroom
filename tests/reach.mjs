// Reachability, replayed. For every level: the recorded route (tests/reach/<level>.json, made by tests/explore.mjs + tests/reach-tour.mjs) is run step by step on the real
// game in virtual time; each step must land where it did when it was recorded, and the last one must collect the final coin and win the level. Also: a jump is the same
// height at 32, 64, 128 and 256 fps, and the deli's wall tops stay out of reach.  Deterministic; about a minute.
//   npm run test:reach           (LEVELS=deli to run one; the dev server must be up)
import fs from 'fs';
import { open, begin, takeClock } from './vt.mjs';
import { ACTIONS, DT, installSim } from './reach-sim.mjs';

const levels = (process.env.LEVELS ?? 'home,street,deli').split(',');
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const errors = [];

for (const level of levels) {
  const file = new URL(`./reach/${level}.json`, import.meta.url);
  if (!fs.existsSync(file)) { console.log(`SKIP  ${level}: no tests/reach/${level}.json (run tests/explore.mjs and tests/reach-tour.mjs)`); continue; }
  const tour = JSON.parse(fs.readFileSync(file));
  const { browser, page, errors: errs } = await open({ level });
  await begin(page);
  await takeClock(page);
  await page.evaluate(installSim, { DT, ACTIONS });
  const res = await page.evaluate((steps) => {
    const G = window.__hue.useGame, bad = [];
    steps.forEach((s, i) => {
      if (G.getState().phase !== 'playing') { bad.push({ i, act: s.act, why: `phase ${G.getState().phase}` }); return; }
      const r = window.__simx.perform({ x: s.from[0], y: s.from[1], z: s.from[2] }, s.act);
      const dxz = Math.hypot(r.x - s.to[0], r.z - s.to[2]), dy = Math.abs(r.y - s.to[1]);
      const missing = s.picks.filter((p) => !r.picks.includes(p));
      if (dxz > 0.15 || dy > 0.1 || r.mode !== 'ground' || missing.length) bad.push({ i, act: s.act, from: s.from, want: s.to.map((v) => +v.toFixed(2)), got: [r.x, r.y, r.z].map((v) => +v.toFixed(2)), mode: r.mode, missing });
    });
    const g = G.getState();
    return { bad, phase: g.phase, collected: g.collected, total: g.totalCoins, elapsed: +window.__hue.runtime.elapsed.toFixed(1), result: g.result };
  }, tour.steps);
  // A few recorded landings can be on a rim or in a bounce chain, where a micron decides the outcome (the explorer now drops those; routes recorded before that may still hold some).
  // The route still has to win; STRICT=1 asks for every step to land where it was recorded.
  const allowed = process.env.STRICT ? 0 : Math.ceil((tour.robust ? 0.02 : 0.12) * tour.steps.length); // routes made by the explorer's repeatability check ("robust") are held to 2%
  check(`${level}: the recorded steps land where they did when recorded (${res.bad.length} of ${tour.steps.length} landed elsewhere, ${allowed} allowed)`, res.bad.length <= allowed, res.bad.slice(0, 2).map((b) => JSON.stringify(b)).join(' ; '));
  check(`${level}: the replay collects all ${res.total} coins and wins`, res.phase === 'won' && res.collected === res.total, `phase ${res.phase}, ${res.collected}/${res.total} coins, ${res.elapsed} s of game time`);
  errors.push(...errs);
  await browser.close();
}

// A jump is the same height at any frame rate (it was 0.56 m at 30 fps and 0.60 m at 240; the steps are powers of two so the game's clock is exact).
{
  const { browser, page, errors: errs } = await open({ level: 'street' });
  await begin(page);
  await takeClock(page);
  const apex = await page.evaluate(() => {
    const R = window.__hue.runtime, D = R.debug, out = {};
    for (const fps of [32, 64, 128, 256]) {
      const dt = 1 / fps;
      D.input = { x: 0, z: 0, run: false, jump: false };
      D.teleport(3, 0, 0, 0);
      for (let i = 0; i < fps; i++) window.__vt.frame(dt);
      const y0 = R.feet.y;
      D.input = { x: 0, z: 0, run: false, jump: true };
      let peak = y0;
      for (let i = 0; i < 1.4 * fps; i++) { if (i * dt >= 1.0) D.input = { x: 0, z: 0, run: false, jump: false }; window.__vt.frame(dt); peak = Math.max(peak, R.feet.y); }
      out[fps] = +(peak - y0).toFixed(3);
    }
    D.input = null;
    return out;
  });
  const vals = Object.values(apex);
  check('a full jump is the same height at 32, 64, 128 and 256 fps', Math.max(...vals) - Math.min(...vals) < 0.02 && Math.min(...vals) > 0.59, JSON.stringify(apex));
  errors.push(...errs);
  await browser.close();
}

// The joystick across the street's camera flip: a direction held through the flip carries straight on, but a thumb that stays on the stick and steers afterwards gets the new view
// (it used to keep the old one until the stick was let go, so "right" walked him left across the screen).
{
  const { browser, page, errors: errs } = await open({ level: 'street', viewport: { width: 844, height: 390 } });
  await begin(page);
  await takeClock(page);
  const r = await page.evaluate(() => {
    const H = window.__hue, R = H.runtime, D = R.debug, T = H.touch, out = {};
    const frames = (n) => { for (let i = 0; i < n; i++) window.__vt.frame(1 / 32); };
    const stick = (x, z) => T.setState({ moveX: x, moveZ: z, run: true });
    const start = (x, y, z) => { stick(0, 0); D.input = null; D.teleport(x, y, z, 90); frames(100); };
    start(-1.0, 0.1, -1.5);
    stick(0, -1); frames(32 * 6);
    out.crossed = { x: +R.feet.x.toFixed(2), z: +R.feet.z.toFixed(2), side: R.camSide };
    stick(0, 0); frames(40);
    start(-4.0, 0.1, -1.5);
    stick(0.7, -0.7); frames(32 * 4); // across the centre line, thumb still down
    out.flipped = R.camSide;
    const x0 = R.feet.x;
    stick(1, 0); frames(64);
    out.nudge = +((R.feet.x - x0) * (R.camSide > 0 ? 1 : -1)).toFixed(2); // metres toward the RIGHT of the screen
    stick(0, 0); frames(20);
    const x1 = R.feet.x;
    stick(1, 0); frames(48); stick(0, 0);
    out.released = +((R.feet.x - x1) * (R.camSide > 0 ? 1 : -1)).toFixed(2);
    return out;
  });
  check('joystick: holding one direction carries straight across the street through the camera flip', r.crossed.z > 1.2 && Math.abs(r.crossed.x + 1.0) < 0.15 && r.crossed.side === -1, JSON.stringify(r.crossed));
  check('joystick: steering without letting go after the flip goes the way the stick points on the new view', r.flipped === -1 && r.nudge > 0.5, `moved ${r.nudge} m toward the right of the screen`);
  check('joystick: and so does the stick after letting go', r.released > 0.5, `moved ${r.released} m toward the right of the screen`);
  errors.push(...errs);
  await browser.close();
}

// The deli's walls: from the pillar beside the left wall, a jump toward the wall used to land on its top (2.34 m), and a walk along it dropped him out of the level.
if (levels.includes('deli')) {
  const { browser, page, errors: errs } = await open({ level: 'deli' });
  await begin(page);
  await takeClock(page);
  await page.evaluate(installSim, { DT, ACTIONS });
  const r = await page.evaluate(() => {
    const out = [];
    for (const [x, y, z, id] of [[-2.99, 1.98, -2.26, 'J6'], [-2.99, 1.98, -2.26, 'JR6'], [3.4, 1.99, 0.95, 'J0'], [3.4, 1.99, 1.5, 'J2'], [3.4, 1.99, 1.5, 'JR0']]) out.push({ id, from: [x, y, z], ...window.__simx.perform({ x, y, z }, id) });
    return out;
  });
  const worst = Math.max(...r.map((o) => (o.fell ? 99 : o.y)));
  check('deli: no jump from a shelf top puts him on a wall top or out of the level', worst < 2.2, r.map((o) => `${o.id}→y ${o.fell ? 'FELL' : o.y.toFixed(2)}`).join(' '));
  errors.push(...errs);
  await browser.close();
}

const real = errors.filter((e) => !/deprecated parameters/.test(e));
console.log(real.length ? '\nbrowser errors:\n' + [...new Set(real)].slice(0, 5).join('\n') : '\nno browser errors');
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) && !real.length ? 0 : 1);
