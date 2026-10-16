// The actions the reachability explorer and the route replay share, and the in-page simulator that performs one of them in virtual time.
// An action starts from a rest state (Hue standing still on something) and ends at the next rest state: a walk, a run, a jump or a hop in one of 8 directions.
/** 1/32 s: exactly representable, so the game's own clock steps by exactly this every frame (1/30 is not, and its rounding drifts with how long the page has run). */
export const DT = 1 / 32;

const DIRS = Array.from({ length: 8 }, (_, i) => { const a = (i * Math.PI) / 4; return [+Math.cos(a).toFixed(4), +Math.sin(a).toFixed(4)]; });
/** `tIn`: seconds the direction is held; `jump`: seconds the jump key is held; `air`: keep the direction held while he is in the air or landing. */
export const ACTIONS = [
  ...DIRS.map((d, i) => ({ id: `W${i}`, d, run: false, tIn: 0.4, jump: 0 })),
  ...DIRS.map((d, i) => ({ id: `R${i}`, d, run: true, tIn: 0.5, jump: 0 })),
  ...DIRS.map((d, i) => ({ id: `J${i}`, d, run: false, tIn: 0.1, jump: 0.9, air: true })),
  ...DIRS.map((d, i) => ({ id: `JR${i}`, d, run: true, tIn: 0.3, jump: 0.9, air: true })),
  ...DIRS.map((d, i) => ({ id: `H${i}`, d, run: false, tIn: 0.1, jump: 0.1, air: true })),
  { id: 'JS', d: [0, 0], run: false, tIn: 0.1, jump: 0.9, air: true },
];

/** Runs in the page. Installs window.__simx = { perform(start, actionId), resetProps(), coins }. */
export function installSim({ DT, ACTIONS }) {
  const H = window.__hue, R = H.runtime, D = R.debug, G = H.useGame;
  H.scene.updateMatrixWorld(true);
  const coins = [];
  H.scene.traverse((o) => {
    const n = o.userData?.name ?? o.name;
    if (/^COIN_\d+$/.test(n)) { const p = o.getWorldPosition(new o.position.constructor()); coins.push({ name: n, x: p.x, y: p.y, z: p.z, req: o.userData?.requires ?? null }); }
  });
  coins.sort((a, b) => a.name.localeCompare(b.name));
  const yMin = Math.min(...coins.map((c) => c.y)) - 0.5;
  const acts = Object.fromEntries(ACTIONS.map((a) => [a.id, a]));
  // Loose props (books, cans, the deli's food) go back where they started before every action: a rest state on a piece that has since moved is a false one.
  const props = [...(H.pushables ?? [])].map((b) => ({ b, t: b.translation(), r: b.rotation() }));
  const resetProps = () => {
    for (const p of props) { p.b.setTranslation({ x: p.t.x, y: p.t.y, z: p.t.z }, true); p.b.setRotation({ x: p.r.x, y: p.r.y, z: p.r.z, w: p.r.w }, true); p.b.setLinvel({ x: 0, y: 0, z: 0 }, true); p.b.setAngvel({ x: 0, y: 0, z: 0 }, true); }
  };
  const pickCheck = (picks) => {
    const f = R.feet, y0 = f.y + 0.06, y1 = f.y + 0.06 + 0.34, got = G.getState().collectedNames;
    for (const c of coins) {
      if (c.req && !got.includes(c.req)) continue;
      const cy = Math.min(Math.max(c.y, y0), y1);
      if (Math.hypot(c.x - f.x, c.y - cy, c.z - f.z) < 0.14) picks.add(c.name);
    }
  };
  const perform = (st, actId) => {
    const act = acts[actId];
    resetProps();
    D.input = { x: 0, z: 0, run: false, jump: false };
    const yaw = act.d[0] || act.d[1] ? (Math.atan2(-act.d[1], act.d[0]) * 180) / Math.PI : 90;
    D.teleport(st.x, st.y, st.z, yaw);
    for (let i = 0; i < 4; i++) window.__vt.frame(DT);
    const picks = new Set();
    let t = 0, quiet = 0, last = [R.feet.x, R.feet.y, R.feet.z], mode = D.mode, fell = false;
    D.input = { x: act.d[0], z: act.d[1], run: act.run, jump: act.jump > 0 };
    for (let i = 0; i < 20 * 30; i++) {
      window.__vt.frame(DT);
      t += DT;
      mode = D.mode;
      pickCheck(picks);
      const holding = (mode === 'ladder' || mode === 'climb' || mode === 'air' || mode === 'land') && (act.air || mode === 'ladder' || mode === 'climb');
      if (t >= act.jump && act.jump > 0 && D.input.jump) D.input = { ...D.input, jump: false };
      if (t >= act.tIn && !holding) { if (D.input.x || D.input.z || D.input.run) D.input = { x: 0, z: 0, run: false, jump: false }; }
      if (R.feet.y < yMin - 0.3) { fell = true; break; }
      const moved = Math.hypot(R.feet.x - last[0], R.feet.y - last[1], R.feet.z - last[2]);
      last = [R.feet.x, R.feet.y, R.feet.z];
      if (t > act.tIn && mode === 'ground' && R.grounded && moved < 0.0015 && !D.input.x && !D.input.z) { if (++quiet >= 4) break; } else quiet = 0;
    }
    D.input = { x: 0, z: 0, run: false, jump: false };
    // Still at rest a third of a second later? (A spot balanced on a rim, or between two bounces, is not a rest: it slides on.)
    let steady = true;
    if (!fell && mode === 'ground' && R.grounded) {
      const at = [R.feet.x, R.feet.y, R.feet.z];
      for (let i = 0; i < 11; i++) window.__vt.frame(DT);
      steady = R.grounded && D.mode === 'ground' && Math.hypot(R.feet.x - at[0], R.feet.y - at[1], R.feet.z - at[2]) < 0.002;
    }
    return { x: R.feet.x, y: R.feet.y, z: R.feet.z, t, picks: [...picks], mode: steady ? mode : 'unsteady', fell, grounded: R.grounded && steady };
  };
  // The same action from a start nudged by two microns: an edge is only kept if it lands in the same place (rim and bounce outcomes are not repeatable, and a route replay must be).
  const performRobust = (st, actId) => {
    const a = perform(st, actId);
    const b = perform({ x: st.x + 2e-6, y: st.y, z: st.z - 2e-6 }, actId);
    const same = a.mode === b.mode && a.fell === b.fell && Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) < 0.003 && a.picks.join() === b.picks.join();
    return { ...a, robust: same };
  };
  window.__simx = { perform, performRobust, resetProps, coins, yMin };
}
