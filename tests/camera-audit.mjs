// The camera must follow Hue the whole time: on the real game, in virtual time (deterministic, fast), checked two ways.
//   route : the recorded route (tests/reach/<level>.json) is played step by step and, every few frames, a ray goes from the camera to Hue's feet, chest and head.
//           Anything solid in the way for longer than a blink is a failure, and so is Hue leaving the frame or the camera ending up inside a fixture or outside the walls.
//   spots : every resting spot the explorer found (tests/reach/raw/<level>.json) is arrived at by a recorded move (so the camera has the heading it would really have),
//           left to settle for 3 s, and measured the same way. (A teleport alone would not do: the chase camera trails his heading, and only real movement sets it.)
// Also reported (not failing): how big he is on screen, so a camera that is too far away or looks straight down on him shows up.
//   node tests/camera-audit.mjs [route|spots|all]     LEVEL=deli (default)   dev server on 3100
import fs from 'fs';
import { open, begin, takeClock } from './vt.mjs';
import { ACTIONS, DT, installSim } from './reach-sim.mjs';

const level = process.env.LEVEL ?? 'deli';
const mode = process.argv[2] ?? 'all';
const MESH = new RegExp(process.env.MESH ?? '^(V_|BOOK_KICK)');
const SIZE_MIN = Number(process.env.SIZE_MIN ?? 0.08);
const BLINK = Number(process.env.BLINK ?? 0.4); // seconds Hue may be out of sight before it counts (a shot changing over)
// Resting spots: a few reachable spots have no camera that sees him (stock all round him deep in the freezer pocket, hard against the donut display, the back of the hot line under its
// rack). They are counted, not forgiven: the number may not grow. Lower it when a model change frees some.
const MAX_HIDDEN = Number(process.env.MAX_HIDDEN ?? 30), MAX_OUT_OF_FRAME = Number(process.env.MAX_OUT_OF_FRAME ?? 2);
const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };

const allErrors = [];
async function setup(neverWin) {
  const { browser, page, errors } = await open({ level });
  allErrors.push(...errors);
  await begin(page);
  await takeClock(page);
  await page.evaluate(installSim, { DT, ACTIONS });
  // The spot audit walks past coins on the way: they count (a door can wait for one) but the last one never wins, so the run stays live.
  if (neverWin) await page.evaluate(() => { window.__hue.useGame.setState({ collect: (name) => window.__hue.useGame.setState((s) => ({ collected: Math.min(s.collected + 1, s.totalCoins - 1), collectedNames: name ? [...s.collectedNames, name] : s.collectedNames })) }); });
// In the page: look() measures how Hue is seen right now.
await page.evaluate(({ MESH, SIZE_MIN }) => {
  const h = window.__hue, R = h.runtime, re = new RegExp(MESH);
  const lens = h.camera, rc = h.raycaster;
  // Moving door parts (the case's dome, the freezer door) are not counted: they swing out of the way, and the camera's sight map leaves them out too.
  const meshes = () => { const out = []; h.scene.traverse((o) => { if (o.isMesh && o.visible && re.test(o.name)) { let ok = true; for (let p = o.parent; p && ok; p = p.parent) ok = p.visible && !p.userData.door; if (ok) out.push(o); } }); return out; };
  const walls = h.level().camera?.confine;
  window.__cam = {
    look() {
      const cam = R.cameraPos.clone(), ms = meshes();
      const hits = [0.1, 0.28, 0.42].map((hh) => {
        const tgt = R.feet.clone(); tgt.y += hh; const dir = tgt.clone().sub(cam); const dist = dir.length(); dir.normalize();
        rc.set(cam, dir); rc.far = dist - 0.08; rc.near = 0.02; // the last 8 cm are whatever touches him (the sight map ignores the same stretch)
        const hit = rc.intersectObjects(ms, false).filter((i) => { const m = Array.isArray(i.object.material) ? i.object.material[i.face?.materialIndex ?? 0] : i.object.material; return !(m && ((m.transparent && m.opacity < 0.6) || /glaz|glass/i.test(m.name))); });
        return hit.length ? hit[0].object.name : null;
      });
      lens.updateMatrixWorld(true);
      const top = R.feet.clone(); top.y += 0.39;
      const a = R.feet.clone().project(lens), b = top.clone().project(lens);
      // How big he is on screen: his height as a share of the picture's height, but never less than his body's width (straight above him all of him is the top of his head).
      const wide = 0.14 / (2 * cam.distanceTo(R.feet.clone().setY(R.feet.y + 0.2)) * Math.tan((lens.fov * Math.PI) / 360));
      const size = Math.max(Math.abs(b.y - a.y) / 2, wide);
      const el = Math.atan2(cam.y - (R.feet.y + 0.2), Math.hypot(cam.x - R.feet.x, cam.z - R.feet.z)) * 180 / Math.PI;
      const inFrame = [a, b].every((p) => Math.abs(p.x) <= 0.94 && Math.abs(p.y) <= 0.94 && p.z < 1);
      const tol = 0.03; // a camera that grazes a fixture's face by a few centimetres is not inside it
      const inside = h.colliders.filter((c) => !c.userData.ladder && !c.userData.door && c.userData.standable !== false && !(R.cutaway && c.name === 'COL_Median shelf') && c.halfExtents.y * 2 < 2.4 && cam.x > c.center.x - c.halfExtents.x + tol && cam.x < c.center.x + c.halfExtents.x - tol && cam.z > c.center.z - c.halfExtents.z + tol && cam.z < c.center.z + c.halfExtents.z - tol && cam.y > c.center.y - c.halfExtents.y + tol && cam.y < c.center.y + c.halfExtents.y - tol).map((c) => c.name.replace('COL_', ''));
      const opening = R.feet.distanceTo(R.startFeet) < 2.4 && cam.x < (walls?.x0 ?? -99);
      const outside = !!walls && !opening && (cam.x < walls.x0 - 0.02 || cam.x > walls.x1 + 0.02 || cam.z < walls.z0 - 0.02 || cam.z > walls.z1 + 0.02);
      const rig = window.__sight?.rig;
      return { open: rig?.sightOpen && rig.sightAim ? +rig.sightOff.length().toFixed(2) : 0, hidden: hits[1], hits, el: +el.toFixed(0), size: +size.toFixed(3), inFrame, inside: inside.join('+'), outside, cam: cam.toArray().map((v) => +v.toFixed(2)), feet: R.feet.toArray().map((v) => +v.toFixed(2)), fov: +lens.fov.toFixed(0), dist: +cam.distanceTo(R.feet).toFixed(2) };
    },
    settle(sec) { for (let i = 0; i < Math.round(sec / (1 / 32)); i++) window.__vt.frame(1 / 32); },
  };
}, { MESH: MESH.source, SIZE_MIN });
  return { browser, page };
}

const summarise = (label, samples, dtSample) => {
  // Longest unbroken stretch hidden, and where.
  let run = 0, best = { n: 0, at: null }, cur = null;
  for (const s of samples) {
    if (s.hidden) { run++; if (!cur) cur = s; if (run > best.n) best = { n: run, at: cur }; } else { run = 0; cur = null; }
  }
  return { label, hiddenSec: +(best.n * dtSample).toFixed(2), at: best.at, outOfFrame: samples.filter((s) => !s.inFrame).length, frameAt: samples.find((s) => !s.inFrame), insideAt: samples.find((s) => s.inside), inside: [...new Set(samples.filter((s) => s.inside).map((s) => s.inside))], insideN: samples.filter((s) => s.inside).length, outside: samples.filter((s) => s.outside).length, minSize: Math.min(...samples.map((s) => s.size)), n: samples.length };
};

if (mode === 'route' || mode === 'all') {
  const { browser, page } = await setup(false);
  const tour = JSON.parse(fs.readFileSync(new URL(`./reach/${level}.json`, import.meta.url)));
  const every = 3; // frames between measurements
  const per = await page.evaluate(({ steps, every, DT }) => {
    const out = [], X = window.__simx, C = window.__cam;
    const orig = window.__vt.frame;
    let on = false, n = 0, samples = [];
    window.__vt.frame = (dt) => { orig(dt); if (on && ++n > 12 && n % every === 0) samples.push(C.look()); };
    for (let i = 0; i < steps.length; i++) {
      const s = steps[i];
      n = 0; samples = []; on = true;
      X.perform({ x: s.from[0], y: s.from[1], z: s.from[2] }, s.act);
      on = false;
      const during = samples;
      C.settle(2.5);
      out.push({ i, act: s.act, from: s.from.map((v) => +v.toFixed(2)), during, rest: C.look() });
    }
    window.__vt.frame = orig;
    return out;
  }, { steps: tour.steps, every, DT });
  let bad = 0, hiddenTotal = 0;
  const lines = [];
  for (const p of per) {
    const sum = summarise(`step ${p.i} ${p.act}`, p.during.length ? p.during : [p.rest], every * DT);
    const restBad = p.rest.hidden ? ` and still hidden by ${p.rest.hidden} at rest` : '';
    const problems = [sum.hiddenSec > BLINK && `hidden ${sum.hiddenSec}s by ${sum.at?.hidden} (cam ${sum.at?.cam.join(',')} Hue ${sum.at?.feet.join(',')})${restBad}`, p.rest.hidden && !(sum.hiddenSec > BLINK) && `hidden at rest by ${p.rest.hidden} (cam ${p.rest.cam.join(',')} Hue ${p.rest.feet.join(',')})`, sum.outOfFrame * every * DT > BLINK && `out of frame for ${(sum.outOfFrame * every * DT).toFixed(1)}s, ${sum.outOfFrame} of ${sum.n} samples (cam ${sum.frameAt.cam.join(',')} Hue ${sum.frameAt.feet.join(',')})`, sum.insideN * every * DT > BLINK && `camera inside ${sum.inside.join('+')} for ${(sum.insideN * every * DT).toFixed(1)}s (cam ${sum.insideAt.cam.join(',')} Hue ${sum.insideAt.feet.join(',')})`, sum.outside && `camera outside the walls in ${sum.outside} samples`].filter(Boolean);
    hiddenTotal += p.during.filter((s) => s.hidden).length;
    if (problems.length) { bad++; lines.push(`  step ${String(p.i).padStart(2)} ${p.act.padEnd(3)} from ${p.from.join(',')}: ${problems.join('; ')}`); }
  }
  lines.forEach((l) => console.log(l));
  { const all = per.flatMap((p) => p.during.concat(p.rest)); const on = all.filter((s) => s.open > 0.05); console.log(`  standing back in open space (camera at least 5 cm back) in ${Math.round((100 * on.length) / all.length)}% of the route's samples, by ${on.length ? (on.reduce((a, s) => a + s.open, 0) / on.length).toFixed(2) : 0} m on average, at most ${on.length ? Math.max(...on.map((s) => s.open)).toFixed(2) : 0} m`); }
  const roofY = await page.evaluate(() => window.__hue.level().ceiling?.y ?? null);
  if (roofY) { const all = per.flatMap((p) => p.during.concat(p.rest)); console.log(`  camera above the roof (y > ${roofY}) in ${Math.round((100 * all.filter((s) => s.cam[1] > roofY).length) / all.length)}% of the route's samples, highest ${Math.max(...all.map((s) => s.cam[1])).toFixed(2)} m`); }
  const small = per.filter((p) => p.rest.size < SIZE_MIN).map((p) => `${p.i}(${Math.round(p.rest.size * 100)}%)`);
  console.log(`  smallest on screen at rest: ${Math.round(Math.min(...per.map((p) => p.rest.size)) * 100)}% of the picture; below ${Math.round(SIZE_MIN * 100)}% at steps ${small.join(' ') || 'none'}`);
  check(`${level} route: Hue is never out of sight for more than ${BLINK}s, always in frame, camera inside the shop (${bad} of ${per.length} steps have a problem)`, bad === 0);
  await browser.close();
}

if (mode === 'spots' || mode === 'all') {
  const { browser, page } = await setup(true);
  const raw = JSON.parse(fs.readFileSync(new URL(`./reach/raw/${level}.json`, import.meta.url)));
  const at = Object.fromEntries(raw.visited.map(([k, v]) => [k, v]));
  // For each spot, up to two recorded moves that end there (different actions), to arrive with a real heading.
  const incoming = new Map();
  for (const e of raw.edges) {
    const [from, to, , , act] = e;
    if (!at[from] || !at[to] || from === to || !/^(W|R|J|JR|H)\d$/.test(act)) continue;
    const list = incoming.get(to) ?? [];
    if (list.length < 2 && !list.some((l) => l.act === act)) list.push({ from, act });
    incoming.set(to, list);
  }
  const jobs = [];
  for (const [key, list] of incoming) for (const l of list) jobs.push({ key, act: l.act, start: { x: at[l.from].x, y: at[l.from].y, z: at[l.from].z }, at: at[key] });
  console.log(`  ${raw.visited.length} spots, ${jobs.length} arrivals`);
  const res = await page.evaluate(({ jobs }) => {
    const X = window.__simx, C = window.__cam, out = [];
    for (const j of jobs) {
      X.perform(j.start, j.act);
      C.settle(3);
      const l = C.look();
      if (l.hidden || !l.inFrame || l.inside || l.outside || l.size < 0.05) out.push({ key: j.key, act: j.act, ...l });
    }
    return out;
  }, { jobs });
  const hidden = res.filter((r) => r.hidden), frame = res.filter((r) => !r.inFrame), inside = res.filter((r) => r.inside), outside = res.filter((r) => r.outside), small = res.filter((r) => r.size < 0.05 && !r.hidden);
  const byMesh = {};
  for (const r of hidden) byMesh[r.hidden] = (byMesh[r.hidden] ?? 0) + 1;
  console.log(`  hidden at ${hidden.length}, out of frame at ${frame.length}, camera inside a fixture at ${inside.length}, outside the walls at ${outside.length}, under 5% of the picture at ${small.length} (of ${jobs.length} arrivals)`);
  console.log('  hidden by:', Object.entries(byMesh).sort((a, b) => b[1] - a[1]).map(([k, v]) => `${k} x${v}`).join(', ') || 'nothing');
  const show = (title, list) => { if (list.length) console.log(`  ${title}:\n` + list.slice(0, 12).map((r) => `    arrived ${r.act} at ${r.feet.join(',')}: cam ${r.cam.join(',')} ${Math.round(r.size * 100)}%${r.hidden ? ' hidden by ' + r.hidden : ''}${r.inside ? ' inside ' + r.inside : ''}`).join('\n')); };
  show('hidden', hidden); show('out of frame', frame); show('camera inside a fixture', inside); show('camera outside the walls', outside); show('very small', small);
  fs.writeFileSync(process.env.OUT ?? '/dev/null', JSON.stringify(res));
  check(`${level} spots: Hue is in sight, in frame, with the camera inside the shop, at the resting spots he can reach (${hidden.length} hidden of ${MAX_HIDDEN} allowed, ${frame.length} out of frame of ${MAX_OUT_OF_FRAME}, ${inside.length}+${outside.length} camera placement)`, hidden.length <= MAX_HIDDEN && frame.length <= MAX_OUT_OF_FRAME && inside.length + outside.length === 0);
  await browser.close();
}

check('no browser errors', allErrors.length === 0, [...new Set(allErrors)].slice(0, 3).join(' | '));
console.log(`\n${results.filter(Boolean).length}/${results.length} checks passed`);
process.exit(results.every(Boolean) ? 0 : 1);
