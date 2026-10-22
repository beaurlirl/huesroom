// The two street skateboard levels (levels.ts ludlow-skate and broome-skate), ridden whole in virtual time (tests/vt.mjs) by a scripted rider that pops where the generated course has its
// pieces: the route and its collision hold (no bumps, no falling), every rail is ground, every coin is picked up, the finish wins, and the draw distance and haze are on.
//   node tests/skate-maps.mjs         (the dev server must be up: npx next dev -p 3100; needs public/levels/<id>/ made by scripts/prepare_skate_level.py)
import fs from 'fs';
import { open, begin, takeClock } from './vt.mjs';

const results = [];
const check = (name, ok, detail = '') => { results.push(ok); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  — ' + detail : ''}`); };
const levels = (process.env.LEVELS ?? 'broome-skate,ludlow-skate').split(',').filter((l) => fs.existsSync(new URL(`../public/levels/${l}/room.glb`, import.meta.url)));
if (!levels.length) console.log('SKIP  no skate street models in public/levels (see scripts/prepare_skate_level.py)');

for (const level of levels) {
  const { browser, page, errors } = await open({ level });
  await begin(page);
  await takeClock(page);
  const view = await page.evaluate(() => {
    const h = window.__hue;
    return { far: h.camera.far, fog: !!h.scene.fog, hidden: (() => { let n = 0; h.scene.traverse((o) => { if (o.isMesh && !o.visible && /STATIC/.test(o.userData.name ?? o.name)) n++; }); return n; })() };
  });
  const res = await page.evaluate(() => {
    const R = window.__hue.runtime, G = window.__hue.useGame, D = R.debug, S = R.skate;
    const pieces = S.course.pieces;
    let next = 0, popFor = -1, t = 0, fell = false, lowest = Infinity, offLane = 0, hiddenAtEnd = 0, maxSpeed = 0;
    const start = G.getState().collected;
    for (let i = 0; i < 300 * 60; i++) {
      const v = Math.max(S.speed, 1.5);
      while (next < pieces.length && (pieces[next].kind === 'kicker' || pieces[next].kind === 'trail' || S.s > pieces[next].sEnd + 0.5)) next++;
      let pop = false;
      if (next < pieces.length && popFor !== next && D.mode === 'ground') {
        const p = pieces[next];
        const target = p.kind === 'rail' ? p.s - 0.95 * (v / 2.7) : (p.s + p.sEnd) / 2 - 0.36 * v;
        if (S.s >= target) { pop = true; popFor = next; }
      }
      D.input = { x: S.dir.x, z: S.dir.z, run: false, jump: false, pop };
      window.__vt.frame(1 / 60);
      t = i / 60;
      lowest = Math.min(lowest, R.feet.y - S.lane.at(S.s).y);
      maxSpeed = Math.max(maxSpeed, S.speed);
      if (G.getState().phase === 'won') break;
    }
    const g = G.getState();
    let hidden = 0;
    window.__hue.scene.traverse((o) => { if (o.isMesh && !o.visible && /STATIC/.test(o.userData.name ?? o.name)) hidden++; });
    return { phase: g.phase, t, s: S.s, length: S.lane.length, coins: g.collected, total: g.totalCoins, bumps: S.bumps, grinds: S.grinds, rails: pieces.filter((p) => p.kind === 'rail').length, pieces: pieces.length, lowest, maxSpeed, reward: g.result?.reward, hidden };
  });
  check(`${level}: the haze and the draw distance are on`, view.far < 200 && view.fog, `far plane ${view.far} m, fog ${view.fog}`);
  check(`${level}: the scripted rider rides the whole route and wins`, res.phase === 'won', `${res.s.toFixed(0)} of ${res.length.toFixed(0)} m in ${res.t.toFixed(0)} s of game time (${(res.length / res.t).toFixed(1)} m/s average)`);
  check(`${level}: the route and its collision hold: no bump, never under the ground`, res.bumps === 0 && res.lowest > -0.05, `${res.bumps} bumps, lowest ${res.lowest.toFixed(3)} m under the route's height`);
  check(`${level}: every rail on the course is ground`, res.grinds === res.rails && res.rails > 0, `${res.grinds} of ${res.rails}`);
  check(`${level}: every coin is picked up and banked`, res.coins === res.total && res.total > 20 && res.reward && res.reward.base === res.coins, `${res.coins} of ${res.total}, reward ${JSON.stringify(res.reward)}`);
  check(`${level}: the street behind and beyond the window is not drawn`, res.hidden > 0, `${res.hidden} building chunks hidden at the finish`);
  check(`${level}: no errors in the page`, errors.length === 0, errors.slice(0, 3).join(' | '));
  await browser.close();
}
const failed = results.filter((r) => !r).length;
console.log(failed ? `\n${failed} FAILED` : '\nall passed');
process.exit(failed ? 1 : 0);
