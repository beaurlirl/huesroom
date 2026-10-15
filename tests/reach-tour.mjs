// Turns an explorer dump (tests/reach/raw/<level>.json) into the route replay tests/reach/<level>.json: from the spawn, repeatedly take the fastest known way to the
// nearest coin not yet collected (a coin that needs another one first waits for it). A greedy tour, not a speedrun: every step starts and ends standing still.
//   node tests/reach-tour.mjs <level>
import fs from 'fs';

const level = process.argv[2];
const d = JSON.parse(fs.readFileSync(new URL(`./reach/raw/${level}.json`, import.meta.url)));
const V = new Map(d.visited);
const adj = new Map();
for (const [a, b, t, picks, act, ex, ey, ez] of d.edges) {
  if (!adj.has(a)) adj.set(a, []);
  adj.get(a).push({ from: a, to: b, t, picks: picks ? picks.split(',') : [], act, end: [ex, ey, ez] });
}

function dijkstra(src) {
  const dist = new Map([[src, 0]]), prev = new Map();
  const heap = [[0, src]];
  const push = (x) => { heap.push(x); let i = heap.length - 1; while (i > 0) { const p = (i - 1) >> 1; if (heap[p][0] <= heap[i][0]) break; [heap[p], heap[i]] = [heap[i], heap[p]]; i = p; } };
  const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let i = 0; for (;;) { let m = i; const l = 2 * i + 1, r = l + 1; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === i) break; [heap[m], heap[i]] = [heap[i], heap[m]]; i = m; } } return top; };
  while (heap.length) {
    const [du, u] = pop();
    if (du > (dist.get(u) ?? Infinity)) continue;
    for (const e of adj.get(u) ?? []) { const nd = du + e.t; if (nd < (dist.get(e.to) ?? Infinity)) { dist.set(e.to, nd); prev.set(e.to, e); push([nd, e.to]); } }
  }
  return { dist, prev };
}

const coins = d.coins;
const collected = new Set();
const steps = [];
let cur = d.start, total = 0;
const unreachable = [];
while (collected.size + unreachable.length < coins.length) {
  const { dist, prev } = dijkstra(cur);
  let best = null;
  for (const c of coins) {
    if (collected.has(c.name) || unreachable.includes(c.name)) continue;
    if (c.req && !collected.has(c.req)) continue;
    for (const [a, list] of adj) {
      const da = dist.get(a);
      if (da === undefined) continue;
      for (const e of list) if (e.picks.includes(c.name) && (!best || da + e.t < best.total)) best = { coin: c.name, total: da + e.t, edge: e };
    }
  }
  if (!best) {
    const left = coins.filter((c) => !collected.has(c.name) && !unreachable.includes(c.name));
    // what is left is either out of reach or waiting for a coin that is
    for (const c of left) unreachable.push(c.name);
    break;
  }
  const path = [best.edge];
  for (let k = best.edge.from; k !== cur; k = prev.get(k).from) path.unshift(prev.get(k));
  for (const e of path) {
    const s = V.get(e.from);
    steps.push({ from: [+s.x.toFixed(3), +s.y.toFixed(3), +s.z.toFixed(3)], act: e.act, to: e.end, t: e.t, picks: e.picks.filter((p) => !collected.has(p)) });
    for (const p of e.picks) collected.add(p);
    total += e.t;
  }
  collected.add(best.coin);
  cur = best.edge.to;
}
const out = { level, coins: coins.length, reached: collected.size, unreachable, botSeconds: +total.toFixed(1), steps };
fs.writeFileSync(new URL(`./reach/${level}.json`, import.meta.url), JSON.stringify(out));
console.log(`${level}: ${steps.length} steps, ${collected.size}/${coins.length} coins, rest-to-rest bot time ${total.toFixed(1)} s${unreachable.length ? ', NOT reached: ' + unreachable.join(' ') : ''}`);
