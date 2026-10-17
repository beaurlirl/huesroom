// How smooth is the street's camera flip? Hue walks across the street's centre line in virtual time; every frame the camera's position and direction are recorded and
// the speed, acceleration and jerk of the camera, how fast it turns, and where Hue sits in the picture are worked out. A flip that eases in and out has no jump in any of them.
// Run as a test (npm run test:street) it fails if any of them goes over its limit; `--json` prints the numbers only.
//   node tests/flip-street.mjs [--json]      dev server on 3100
import { open, begin, takeClock } from './vt.mjs';

const json = process.argv.includes('--json');
const { browser, page, errors } = await open({ level: 'street', viewport: { width: 1280, height: 720 } });
await begin(page);
await takeClock(page);
const runs = await page.evaluate(() => {
  const H = window.__hue, R = H.runtime, D = R.debug, cam = H.camera;
  const DT = 1 / 64;
  const frames = (n) => { for (let i = 0; i < n; i++) window.__vt.frame(DT); };
  const V = cam.position.constructor;
  const record = (steps, input) => {
    const rows = [];
    for (let i = 0; i < steps; i++) {
      D.input = input;
      window.__vt.frame(DT);
      cam.updateMatrixWorld(true);
      const fwd = new V(0, 0, -1).applyQuaternion(cam.quaternion);
      const p = R.feet.clone().setY(R.feet.y + 0.2).project(cam);
      rows.push({ t: i * DT, x: cam.position.x, y: cam.position.y, z: cam.position.z, fx: fwd.x, fy: fwd.y, fz: fwd.z, flip: R.camFlip, side: R.camSide, nx: p.x, ny: p.y, hz: R.feet.z });
    }
    return rows;
  };
  const out = {};
  // Walking across the centre line (z = 0) from each side, at walking pace and running, at a place with a clear road (x = -3).
  for (const [name, z0, dir, run] of [['north to south, walking', -1.2, 1, false], ['south to north, walking', 1.2, -1, false], ['north to south, running', -1.2, 1, true], ['south to north, running', 1.2, -1, true]]) {
    D.input = null;
    D.teleport(-3, 0.1, z0, dir > 0 ? 90 : -90);
    frames(64 * 4);
    out[name] = record(64 * 5, { x: 0, z: dir, run, jump: false });
  }
  // Turning back in the middle of the swing: over the line (the swing starts), then straight back across it before it is done.
  D.input = null;
  D.teleport(-3, 0.1, -1.2, 90);
  frames(64 * 4);
  {
    const rows = [];
    const input = (z) => ({ x: 0, z, run: true, jump: false });
    for (let i = 0; i < 64 * 6; i++) {
      // forward until 0.45 s after he is over the line, then back until he is clear on the far side again
      const crossed = rows.find((r) => r.hz > 0.15);
      const sinceCrossed = crossed ? i / 64 - crossed.t : -1;
      const z = !crossed || sinceCrossed < 0.45 ? 1 : -1;
      D.input = input(z);
      window.__vt.frame(DT);
      cam.updateMatrixWorld(true);
      const fwd = new V(0, 0, -1).applyQuaternion(cam.quaternion);
      const p = R.feet.clone().setY(R.feet.y + 0.2).project(cam);
      rows.push({ t: i * DT, x: cam.position.x, y: cam.position.y, z: cam.position.z, fx: fwd.x, fy: fwd.y, fz: fwd.z, flip: R.camFlip, side: R.camSide, nx: p.x, ny: p.y, hz: R.feet.z });
    }
    out['turning back mid-swing'] = rows;
  }
  D.input = null;
  return out;
});

const dt = 1 / 64;
const len = (a) => Math.hypot(...a);
const sub = (a, b) => a.map((v, i) => v - b[i]);
const results = {};
for (const [name, rows] of Object.entries(runs)) {
  const pos = rows.map((r) => [r.x, r.y, r.z]), fwd = rows.map((r) => [r.fx, r.fy, r.fz]);
  const vel = pos.slice(1).map((p, i) => sub(p, pos[i]).map((v) => v / dt));
  const acc = vel.slice(1).map((v, i) => sub(v, vel[i]).map((x) => x / dt));
  const jerk = acc.slice(1).map((a, i) => sub(a, acc[i]).map((x) => x / dt));
  const turn = fwd.slice(1).map((f, i) => Math.acos(Math.min(1, Math.max(-1, f[0] * fwd[i][0] + f[1] * fwd[i][1] + f[2] * fwd[i][2]))) / dt); // rad/s
  const tacc = turn.slice(1).map((w, i) => Math.abs(w - turn[i]) / dt);
  const flipFrames = rows.map((r, i) => (r.flip > 0.001 && r.flip < 0.999 ? i : -1)).filter((i) => i >= 0);
  const i0 = Math.max(0, (flipFrames[0] ?? 0) - 8), i1 = Math.min(rows.length - 2, (flipFrames.at(-1) ?? 0) + 8); // the flip and a little either side
  const maxIn = (arr, f = (x) => x) => Math.max(...arr.slice(i0, i1).map(f));
  const hue = rows.slice(i0, i1).map((r) => Math.max(Math.abs(r.nx), Math.abs(r.ny)));
  results[name] = {
    flipSeconds: +(flipFrames.length * dt).toFixed(2),
    crossedAtT: +(rows.find((r) => Math.abs(r.hz) < 0.12)?.t ?? NaN).toFixed(2),
    camSpeed: +maxIn(vel, len).toFixed(2),
    camAccel: +maxIn(acc, len).toFixed(1),
    camJerk: +maxIn(jerk, len).toFixed(0),
    biggestStep: +(Math.max(...pos.slice(1).slice(i0, i1).map((p, i) => len(sub(p, pos[i0 + i])))) * 100).toFixed(1), // cm in one frame
    turnRate: +((maxIn(turn) * 180) / Math.PI).toFixed(0),
    turnAccel: +((maxIn(tacc) * 180) / Math.PI).toFixed(0),
    worstHueOffset: +Math.max(...hue).toFixed(2), // 1 = at the edge of the picture
    sideChanges: rows.filter((r, i) => i && r.side !== rows[i - 1].side).length,
  };
}
const LIMITS = { camAccel: 25, camJerk: 450, biggestStep: 11, turnRate: 215, worstHueOffset: 0.5 };
let failed = 0;
for (const [name, r] of Object.entries(results)) {
  const over = Object.entries(LIMITS).filter(([k, v]) => r[k] > v).map(([k, v]) => `${k} ${r[k]} over ${v}`);
  if (over.length) failed++;
  if (!json) console.log(`${over.length ? 'FAIL' : 'PASS'}  street camera flip, ${name}: ${over.length ? over.join('; ') : `peak ${r.camSpeed} m/s, accel ${r.camAccel}, jerk ${r.camJerk}, biggest step ${r.biggestStep} cm, turns at most ${r.turnRate} deg/s, Hue never beyond ${r.worstHueOffset} of the way to the edge`}`);
}
if (json) console.log(JSON.stringify(results));
else {
  console.log('camera through the street flip (per run: the flip and 8 frames either side)');
  console.log('run'.padEnd(28), 'flip s  speed m/s  accel m/s2  jerk m/s3  biggest step cm  turn deg/s  turn accel deg/s2  Hue off-centre');
  for (const [name, r] of Object.entries(results)) console.log(name.padEnd(28), String(r.flipSeconds).padEnd(7), String(r.camSpeed).padEnd(10), String(r.camAccel).padEnd(11), String(r.camJerk).padEnd(10), String(r.biggestStep).padEnd(16), String(r.turnRate).padEnd(11), String(r.turnAccel).padEnd(18), r.worstHueOffset);
}
if (errors.length) console.log('browser errors:', [...new Set(errors)].slice(0, 3).join(' | '));
await browser.close();
process.exit(failed || errors.length ? 1 : 0);
