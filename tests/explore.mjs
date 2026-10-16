// Reachability explorer: a breadth-first search over the REAL game (virtual time, fixed dt). From the spawn it performs every action in tests/reach-sim.mjs from each rest
// state it finds (new states are kept per grid cell), so anything it reaches is reachable by the actual physics, and any action that ends below the level is a hole.
// It also writes what it learned as timed edges, which tests/reach-tour.mjs turns into the route replay (tests/reach/<level>.json).
//   node tests/explore.mjs <level> [maxStates=12000] [cell=0.25]        (about 15 to 45 minutes a level; run it when the level changes, not on every commit)
// Writes tests/reach/raw/<level>.json (not committed).
import fs from 'fs';
import { open, begin, takeClock } from './vt.mjs';
import { ACTIONS, DT, installSim } from './reach-sim.mjs';

const level = process.argv[2] || 'deli';
const MAX = +(process.argv[3] || 12000);
const CELL = +(process.argv[4] || 0.25);
const OUT = new URL(`./reach/raw/${level}.json`, import.meta.url).pathname;
fs.mkdirSync(new URL('./reach/raw/', import.meta.url).pathname, { recursive: true });

const { browser, page, errors } = await open({ level });
await begin(page);
await takeClock(page);
await page.evaluate(installSim, { DT, ACTIONS });
await page.evaluate(({ CELL, MAX }) => {
  const H = window.__hue, R = H.runtime, G = H.useGame, X = window.__simx;
  G.setState({ totalCoins: 9999 }); // never win while exploring
  // A coin that waits for another (the deli: pay before you grab your food), and the doors that open on one, are searched open: collect the one they wait for, for real, first.
  const home = { x: R.feet.x, y: R.feet.y, z: R.feet.z };
  for (const need of new Set(X.coins.map((c) => c.req).filter(Boolean))) {
    const r = X.coins.find((c) => c.name === need);
    for (const dy of [0.25, 0.15, 0.35, 0.05]) {
      if (G.getState().collectedNames.includes(need)) break;
      R.debug.input = { x: 0, z: 0, run: false, jump: false };
      R.debug.teleport(r.x, r.y - dy, r.z, 90);
      for (let i = 0; i < 12; i++) window.__vt.frame(1 / 30);
    }
  }
  R.debug.teleport(home.x, home.y, home.z, 90);
  for (let i = 0; i < 12; i++) window.__vt.frame(1 / 30);
  const key = (x, y, z) => `${Math.round(x / CELL)},${Math.round(y / 0.15)},${Math.round(z / CELL)}`;
  const S = { visited: new Map(), queue: [], edges: [], leaks: [], coinFirst: {}, expanded: 0, frames: 0, stuck: [], seeds: [], coins: X.coins };
  window.__ex = S;
  S.start = key(home.x, home.y, home.z);
  S.visited.set(S.start, { x: home.x, y: home.y, z: home.z, from: null, act: null });
  S.queue.push(S.start);
  // The foot of every ladder is a start of its own: the climb is checked from it, and the route replay says whether the walk-up from the street reaches it.
  for (const c of H.colliders) {
    const u = c.userData;
    if (!u.ladder) continue;
    const [ax, ay] = u.approach_from_blender_xy; const m = Math.hypot(ax, ay) || 1, afx = ax / m, afz = -ay / m;
    const depth = Math.abs(c.halfExtents.x * -afx) + Math.abs(c.halfExtents.z * -afz);
    const sx = c.center.x + afx * (depth + 0.07), sz = c.center.z + afz * (depth + 0.07), sy = u.bottom_z_blender + 0.005;
    const k = key(sx, sy, sz);
    S.seeds.push({ name: c.name, x: sx, y: sy, z: sz, key: k });
    if (!S.visited.has(k)) { S.visited.set(k, { x: sx, y: sy, z: sz, from: null, act: 'SEED', seed: c.name }); S.queue.push(k); }
  }
  S.step = (budgetMs) => {
    const t0 = Date.now();
    while (S.queue.length && Date.now() - t0 < budgetMs) {
      const k = S.queue.shift(), st = S.visited.get(k);
      S.expanded++;
      for (const id of window.__actIds) {
        const r = X.perform(st, id);
        S.frames += Math.round(r.t / (1 / 30)) + 4;
        if (r.fell) { S.leaks.push({ from: k, at: [st.x, st.y, st.z], act: id }); continue; }
        if (r.mode !== 'ground' || !r.grounded) { S.stuck.push({ from: k, act: id, mode: r.mode, at: [r.x, r.y, r.z] }); continue; }
        const nk = key(r.x, r.y, r.z);
        if (!S.visited.has(nk)) { S.visited.set(nk, { x: r.x, y: r.y, z: r.z, from: k, act: id }); S.queue.push(nk); }
        if (nk !== k) S.edges.push([k, nk, +r.t.toFixed(2), r.picks.join(','), id, +r.x.toFixed(3), +r.y.toFixed(3), +r.z.toFixed(3)]);
        for (const p of r.picks) if (!(p in S.coinFirst)) S.coinFirst[p] = { state: nk, via: k, act: id };
      }
      if (S.visited.size >= MAX) return { done: true };
    }
    return { done: !S.queue.length };
  };
}, { CELL, MAX });
await page.evaluate((ids) => { window.__actIds = ids; }, ACTIONS.map((a) => a.id));

const dump = () => page.evaluate(() => { const S = window.__ex; return { start: S.start, visited: [...S.visited.entries()], edges: S.edges, leaks: S.leaks, stuck: S.stuck.slice(0, 300), coinFirst: S.coinFirst, coins: S.coins, seeds: S.seeds }; });
const t0 = Date.now();
let lastDump = Date.now();
for (;;) {
  const r = await page.evaluate(() => { const x = window.__ex.step(15000); const S = window.__ex; return { ...x, visited: S.visited.size, queue: S.queue.length, expanded: S.expanded, coins: Object.keys(S.coinFirst).length, leaks: S.leaks.length, stuck: S.stuck.length, frames: S.frames }; });
  console.log(`[${((Date.now() - t0) / 1000).toFixed(0)}s] visited ${r.visited} queue ${r.queue} expanded ${r.expanded} coins ${r.coins} holes ${r.leaks} non-rest ${r.stuck}`);
  if (r.done) break;
  if (Date.now() - lastDump > 300000) { fs.writeFileSync(OUT, JSON.stringify(await dump())); lastDump = Date.now(); }
}
const data = await dump();
fs.writeFileSync(OUT, JSON.stringify(data));
const reached = new Set(Object.keys(data.coinFirst));
console.log(`${level}: ${data.visited.length} rest states, ${data.edges.length} timed edges, ${data.leaks.length} holes (actions that ended below the level)`);
console.log(`coins reached: ${reached.size} of ${data.coins.length}${data.coins.length === reached.size ? '' : '; NOT reached: ' + data.coins.filter((c) => !reached.has(c.name)).map((c) => c.name).join(' ')}`);
if (errors.length) console.log('browser errors:', errors.slice(0, 3));
await browser.close();
process.exit(0);
