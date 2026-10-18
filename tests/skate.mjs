// The skateboard level (levels.ts mode "skate"; the test yard, public/levels/skate-yard, ridden down the screen toward -z with the camera behind him): pushing, braking, the ollie, bumping, a kicker, rails, coins, the finish line and
// the whole right-stick path (touch stick -> flick -> pop), the camera behind him. The real game in virtual time (tests/vt.mjs); deterministic.
// In here `x` is the distance along the lane, u (the yard's lane is world -z): scripted `{ x: 1 }` is the stick pushed forward, `{ x: -1 }` pulled back.
//   node tests/skate.mjs          (the dev server must be up: npx next dev -p 3100)
import { open, begin, takeClock } from './vt.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const { browser, page, errors } = await open({ level: 'skate-yard' });
await begin(page);
await takeClock(page);

// Helpers that live in the page. `drive(frames, fn)` steps the game; fn(i, S) returns that frame's scripted input (or null for none).
await page.evaluate(() => {
  const R = window.__hue.runtime, D = R.debug, G = window.__hue.useGame;
  const idle = { x: 0, z: 0, run: false, jump: false };
  const lane = (i) => ({ x: 0, z: -(i.x ?? 0), run: false, jump: false, pop: !!i.pop });
  window.__sk = {
    R, G,
    /** Back to the start with the given speed, optionally somewhere else along the lane. */
    reset(x = 0.5, speed = 0) {
      D.input = idle;
      D.teleport(0, 0, -x, 90);
      window.__vt.frame(1 / 60);
      D.skateSpeed(speed);
      R.skate.pops = R.skate.grinds = R.skate.bumps = 0;
    },
    /** Steps `n` frames of 1/fps; fn(i, t, snapshot) -> input. Returns the trace. */
    drive(n, fn, fps = 60) {
      const dt = 1 / fps, trace = [];
      for (let i = 0; i < n; i++) {
        const snap = { x: -R.feet.z, y: R.feet.y, speed: R.skate.speed, mode: D.mode, grinding: R.skate.grinding };
        const inp = fn ? fn(i, i * dt, snap) : null;
        D.input = inp ? lane(inp) : idle;
        window.__vt.frame(dt);
        trace.push({ x: -R.feet.z, y: R.feet.y, v: R.skate.speed, mode: D.mode, g: G.getState().collected });
      }
      return trace;
    },
    state() { return { x: -R.feet.z, y: R.feet.y, v: R.skate.speed, mode: D.mode, pops: R.skate.pops, grinds: R.skate.grinds, bumps: R.skate.bumps, rail: R.skate.railName, coins: G.getState().collected, phase: G.getState().phase }; },
  };
});
const S = (fn, ...a) => page.evaluate(fn, ...a);

// ---- pushing, rolling, braking (on the flat stretch before the kerb)
await S(() => window.__sk.reset(-1.3, 0));
const push = await S(() => { const t = window.__sk.drive(130, () => ({ x: 1, z: 0, run: false, jump: false })); return { v1: t[59].v, v2: t[129].v, x: t[129].x }; });
check('pushing speeds the board up from a standstill', push.v1 > 1.2 && push.v2 > push.v1, `1 s: ${push.v1.toFixed(2)} m/s, 2.2 s: ${push.v2.toFixed(2)} m/s`);
check('speed tops out at the maximum', push.v2 > 2.6 && push.v2 <= 2.71, `${push.v2.toFixed(2)}`);
await S(() => window.__sk.reset(-1.3, 1.2));
const coast = await S(() => { const t = window.__sk.drive(150); return { v0: t[0].v, v2: t[149].v }; });
check('letting go keeps him rolling, slowly losing speed, never below the coasting floor', coast.v2 < coast.v0 && coast.v2 >= 0.89, `${coast.v0.toFixed(2)} -> ${coast.v2.toFixed(2)} m/s`);
await S(() => window.__sk.reset(-1.3, 0.6));
const slow = await S(() => { const t = window.__sk.drive(200); return { v: t[199].v }; });
check('below the coasting floor he does slow to a stop by himself', slow.v < 0.01, `${slow.v.toFixed(2)} m/s`);
await S(() => window.__sk.reset(-1.3, 1.5));
const brake = await S(() => { const t = window.__sk.drive(60, () => ({ x: -1, z: 0, run: false, jump: false })); return { v: t[59].v }; });
check('stick back brakes to a stop', brake.v < 0.01, `${brake.v.toFixed(2)} m/s`);

// ---- he only goes forward: a stick pushed sideways does nothing, a stick pulled back brakes and never reverses
await S(() => window.__sk.reset(-1.3, 1.2));
const side = await S(() => {
  const D = window.__sk.R.debug;
  const t = [];
  for (let i = 0; i < 90; i++) { D.input = { x: 1, z: 0, run: false, jump: false }; window.__vt.frame(1 / 60); t.push({ v: window.__sk.R.skate.speed, wx: window.__sk.R.feet.x }); }
  return { v0: t[0].v, v1: t[89].v, maxX: Math.max(...t.map((p) => Math.abs(p.wx))) };
});
check('the stick pushed sideways neither speeds him up nor moves him off the lane', side.v1 <= side.v0 + 0.01 && side.maxX < 0.005, `speed ${side.v0.toFixed(2)} -> ${side.v1.toFixed(2)} m/s, furthest off the lane ${side.maxX.toFixed(3)} m`);
await S(() => window.__sk.reset(2.0, 1.0));
const rev = await S(() => { const t = window.__sk.drive(240, () => ({ x: -1 })); return { u0: 2.0, uMin: Math.min(...t.map((p) => p.x)), v: t[239].v }; });
check('holding the stick back brakes him to a stop and he never rolls backward', rev.v < 0.01 && rev.uMin >= rev.u0 - 0.01, `lowest u ${rev.uMin.toFixed(3)}`);

// ---- the camera: behind him, dead centre, the controls turn with it
await S(() => window.__sk.reset(3.0, 0));
const cam = await S(() => {
  const R = window.__sk.R, h = window.__hue;
  const out = [];
  const look = () => {
    const c = h.camera, f = R.feet;
    const ndc = new c.position.constructor(f.x, f.y + 0.2, f.z).project(c);
    const back = (c.position.x - f.x) * R.skate.dir.x + (c.position.z - f.z) * R.skate.dir.z;
    return { ndcX: +ndc.x.toFixed(3), ndcY: +ndc.y.toFixed(3), back: +back.toFixed(2), yaw: +R.cameraYaw.toFixed(3), camX: +c.position.x.toFixed(3) };
  };
  window.__sk.drive(40);
  out.push(look());
  window.__sk.drive(120, () => ({ x: 1 }));
  out.push(look());
  return out;
});
check('the camera is behind him on the lane and he is dead centre in the picture', cam.every((c) => Math.abs(c.ndcX) < 0.01 && c.back < -1.0 && Math.abs(c.camX) < 0.01), JSON.stringify(cam));
check('the camera pulls back as he speeds up, and looks down the lane (the controls turn with it)', cam[1].back < cam[0].back - 0.05 && cam.every((c) => Math.abs(c.yaw) < 0.05), `distance ${(-cam[0].back).toFixed(2)} -> ${(-cam[1].back).toFixed(2)} m`);

// ---- the ollie: same height at any frame rate, and one pop is one jump
const apex = await S(() => {
  const out = {};
  for (const fps of [32, 64, 128]) {
    window.__sk.reset(1.0, 0);
    let peak = 0, air = 0;
    window.__sk.drive(Math.round(fps * 0.3));
    const t = window.__sk.drive(Math.round(fps * 1.2), (i) => ({ x: 0, z: 0, run: false, jump: false, pop: i === 0 }), fps);
    for (const p of t) { peak = Math.max(peak, p.y); if (p.mode === 'air') air += 1 / fps; }
    out[fps] = { peak: +peak.toFixed(3), air: +air.toFixed(2), pops: window.__sk.R.skate.pops };
  }
  return out;
});
check('an ollie rises about a third of a metre', Object.values(apex).every((a) => a.peak > 0.29 && a.peak < 0.40), JSON.stringify(apex));
check('the ollie is the same height at 32, 64 and 128 fps', Math.max(...Object.values(apex).map((a) => a.peak)) - Math.min(...Object.values(apex).map((a) => a.peak)) < 0.025);
check('one pop is one jump and about 0.7 s in the air', Object.values(apex).every((a) => a.pops === 1 && a.air > 0.6 && a.air < 0.85));

// ---- the whole right-stick path: pull back, push forward, in the touch stick's own state, pops; a stick that only springs home does not
const stick = await S(() => {
  const touch = window.__hue.touch;
  const D = window.__sk.R.debug;
  const aim = (seq) => { // seq: [value, frames]...
    D.input = null;
    window.__sk.reset(1.0, 0);
    window.__sk.drive(20);
    D.input = null;
    for (const [v, n] of seq) for (let i = 0; i < n; i++) { touch.setState({ aimY: v }); window.__vt.frame(1 / 60); }
    touch.setState({ aimY: 0 });
    const t = window.__sk.state();
    window.__sk.drive(5);
    return t.pops;
  };
  // aimY +1 = the stick pushed up: pulled back is -1.
  const flick = aim([[-1, 4], [0.9, 4], [0, 10]]);
  const spring = aim([[-1, 4], [0, 20]]);
  const slow = aim([[-1, 4], [0, 40], [0.9, 4], [0, 10]]);
  window.__sk.R.debug.input = { x: 0, z: 0, run: false, jump: false };
  return { flick, spring, slow };
});
check('pulling the right stick back and pushing it forward pops once', stick.flick === 1, `pops ${stick.flick}`);
check('a stick pulled back and let spring home does not pop', stick.spring === 0, `pops ${stick.spring}`);
check('a slow back-and-forth does not pop', stick.slow === 0, `pops ${stick.slow}`);

// ---- running into the kerb (3.1 to 3.6, 0.13 high) without jumping is a bump: he loses most of his speed, once, and stays behind it
const bump = await S(() => {
  window.__sk.reset(2.0, 2.2);
  const t = window.__sk.drive(120, () => ({ x: 1, z: 0, run: false, jump: false }));
  const st = window.__sk.state();
  return { ...st, maxX: Math.max(...t.map((p) => p.x)) };
});
check('rolling into the kerb is one bump and he stays in front of it', bump.bumps === 1 && bump.maxX < 3.1, `bumps ${bump.bumps}, furthest x ${bump.maxX.toFixed(2)}`);

// ---- an ollie over the kerb picks up the coins in the arc and does not bump
const over = await S(() => {
  window.__sk.reset(2.2, 2.0);
  const c0 = window.__sk.G.getState().collected;
  const t = window.__sk.drive(75, (i, tt, s) => ({ x: 1, z: 0, run: false, jump: false, pop: s.x > 2.45 && s.mode === 'ground' && window.__sk.R.skate.pops === 0 }));
  const st = window.__sk.state();
  return { ...st, got: st.coins - c0, maxX: Math.max(...t.map((p) => p.x)) };
});
check('an ollie clears the kerb without a bump', over.bumps === 0 && over.maxX > 3.8, `bumps ${over.bumps}, x ${over.maxX.toFixed(2)}`);
check('and picks up the coins arced over it', over.got >= 3, `${over.got} coins`);

// ---- the kicker: a ramp throws him up and the coins in the air after it are his
const kick = await S(() => {
  window.__sk.reset(4.3, 2.2);
  const c0 = window.__sk.G.getState().collected;
  const t = window.__sk.drive(80, () => ({ x: 1, z: 0, run: false, jump: false }));
  const st = window.__sk.state();
  const maxY = Math.max(...t.filter((p) => p.x > 5.8).map((p) => p.y));
  return { ...st, got: st.coins - c0, maxY, bumps: st.bumps };
});
check('the kicker launches him into the air', kick.maxY > 0.34 && kick.bumps === 0, `highest ${kick.maxY.toFixed(2)} m after the lip, ${kick.bumps} bumps`);
check('the coins in the air after the kicker are his', kick.got >= 3, `${kick.got} coins`);

// ---- the first rail (8.2 to 9.6, 0.12 high)
const grind = await S(() => {
  window.__sk.reset(6.9, 2.0);
  const c0 = window.__sk.G.getState().collected;
  const rows = [];
  const t = window.__sk.drive(100, (i, tt, s) => {
    rows.push({ x: s.x, y: s.y, mode: s.mode });
    return { x: 1, z: 0, run: false, jump: false, pop: s.x > 7.2 && window.__sk.R.skate.pops === 0 };
  });
  const st = window.__sk.state();
  const onRail = rows.filter((r) => r.mode === 'grind');
  return { ...st, got: st.coins - c0, grindFrames: onRail.length, yMin: Math.min(...onRail.map((r) => r.y)), yMax: Math.max(...onRail.map((r) => r.y)), x0: onRail[0]?.x, x1: onRail[onRail.length - 1]?.x, bumps: st.bumps };
});
check('an ollie that comes down on the rail grinds it by itself', grind.grinds === 1 && grind.grindFrames > 20, `${grind.grinds} grind, ${grind.grindFrames} frames on it, from x ${grind.x0?.toFixed(2)} to ${grind.x1?.toFixed(2)}`);
check('on the rail he rides its height, not the ground\'s', grind.yMin > 0.19 && grind.yMax < 0.215, `y ${grind.yMin?.toFixed(3)} to ${grind.yMax?.toFixed(3)}`);
check('he comes off its far end and rolls on, with no bump', grind.x1 > 9.3 && grind.x > 9.7 && grind.bumps === 0, `last on the rail at ${grind.x1?.toFixed(2)}, now at ${grind.x.toFixed(2)}`);
check('the coins above the rail are his', grind.got >= 4, `${grind.got} coins`);

// ---- popping off the rail early
const off = await S(() => {
  window.__sk.reset(6.9, 2.0);
  let popped = false, peak = 0, leftAt = null;
  window.__sk.drive(100, (i, tt, s) => {
    const first = window.__sk.R.skate.pops === 0 && s.x > 7.2;
    const second = s.mode === 'grind' && s.x > 8.8 && !popped;
    if (second) popped = true;
    if (popped && s.mode !== 'grind' && leftAt === null) leftAt = s.x;
    if (popped) peak = Math.max(peak, s.y);
    return { x: 1, z: 0, run: false, jump: false, pop: first || second };
  });
  return { leftAt, peak, pops: window.__sk.R.skate.pops, grinds: window.__sk.R.skate.grinds };
});
check('a pop while grinding takes him off the rail, up', off.pops === 2 && off.leftAt !== null && off.leftAt < 9.3 && off.peak > 0.3, `left at ${off.leftAt?.toFixed(2)}, peak ${off.peak.toFixed(2)}`);

// ---- walking onto a rail along the ground is a bump, not a grind (the rail's ledge is solid)
const ground = await S(() => {
  window.__sk.reset(7.4, 2.0);
  window.__sk.drive(90, () => ({ x: 1, z: 0, run: false, jump: false }));
  return window.__sk.state();
});
check('rolling into the rail along the ground is a bump, not a grind', ground.bumps === 1 && ground.grinds === 0 && ground.x < 8.2, `bumps ${ground.bumps}, grinds ${ground.grinds}, x ${ground.x.toFixed(2)}`);

// ---- the whole yard: a scripted rider pops where the obstacles are, and the finish line wins and banks the run
const run = await S(() => {
  window.__sk.reset(0.5, 0);
  const t0 = window.__sk.R.elapsed;
  const pops = [2.55, 7.2, 10.85, 13.3, 15.7];
  let next = 0, atWin = null;
  window.__sk.drive(60 * 30, (i, t, s) => {
    const G = window.__sk.G.getState();
    if (G.phase !== 'playing') {
      atWin ??= { bumps: window.__sk.R.skate.bumps, grinds: window.__sk.R.skate.grinds, time: window.__sk.R.elapsed - t0 };
      return { x: 0, z: 0, run: false, jump: false };
    }
    let pop = false;
    if (next < pops.length && s.x > pops[next] && s.mode === 'ground') { pop = true; next++; }
    return { x: 1, z: 0, run: false, jump: false, pop };
  });
  const g = window.__sk.G.getState();
  return { phase: g.phase, collected: g.collected, total: g.totalCoins, reward: g.result?.reward, atWin, x: -window.__sk.R.feet.z, v: window.__sk.R.skate.speed };
});
check('a rider who pops over the obstacles reaches the finish line and wins', run.phase === 'won' && run.atWin, `phase ${run.phase}, ${run.atWin?.time.toFixed(1)} s, ${run.atWin?.bumps} bumps, ${run.atWin?.grinds} grinds`);
check('the run takes both rails and bumps into nothing', run.atWin?.grinds === 2 && run.atWin?.bumps === 0, JSON.stringify(run.atWin));
check('after the finish he rolls to a stop on the ground, not off the end of the world', run.v < 0.01 && run.x > 19.1 && run.x < 20.5, `x ${run.x.toFixed(2)}, ${run.v.toFixed(2)} m/s`);
check('the coins he picked up on the way are banked, not all of them required', run.collected > 25 && run.reward && run.reward.base === run.collected, `${run.collected} of ${run.total} coins, reward ${JSON.stringify(run.reward)}`);

check('no errors in the page', errors.length === 0, errors.slice(0, 3).join(' | '));
await browser.close();
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
