// Skateboard rules that need no browser: the ollie flick and the rails (src/skate/). node --import ./tests/ts-resolve.mjs tests/skate-unit.mjs
import * as THREE from 'three';
import { FlickDetector, FLICK } from '../src/skate/flick.ts';
import { railFromBox, catchRail, railPoint } from '../src/skate/rails.ts';
import { Lane } from '../src/skate/lane.ts';

let fails = 0;
const check = (name, ok, info = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name} ${info}`); if (!ok) fails++; };

// --- the flick -----------------------------------------------------------------------------------------------------------------
/** Plays (time, v) samples through a fresh detector; returns the times it fired. */
function play(samples) {
  const d = new FlickDetector();
  const fired = [];
  for (const [t, v] of samples) if (d.update(v, t)) fired.push(t);
  return fired;
}
check('pull back then push forward quickly pops once', play([[0, 0], [0.05, 0.8], [0.1, 0.9], [0.18, 0.1], [0.24, -0.6], [0.3, -0.8]]).length === 1);
check('push forward then pull back pops too', play([[0, 0], [0.05, -0.8], [0.18, -0.1], [0.24, 0.6]]).length === 1);
check('pulling back and letting the stick spring home does not pop', play([[0, 0], [0.05, 0.9], [0.1, 0.5], [0.15, 0.1], [0.2, -0.1], [0.3, 0]]).length === 0);
check('a slow back-and-forth (over the window) does not pop', play([[0, 0.9], [0.1, 0.9], [0.2, 0], [0.8, -0.8]]).length === 0);
check('holding the stick back for a while then pushing forward pops', play([[0, 0], [0.1, 0.9], [0.3, 0.9], [0.5, 0.9], [0.62, -0.5]]).length === 1);
check('pushing forward alone does not pop', play([[0, 0], [0.1, -0.9], [0.5, -0.9], [1, -0.9]]).length === 0);
check('a held pop does not repeat on every frame', play([[0, 0.9], [0.05, -0.6], [0.06, -0.7], [0.07, -0.8], [0.08, -0.9]]).length === 1);
const twice = play([[0, 0.9], [0.1, -0.6], [0.2, -0.9], [0.4, 0.6], [0.45, 0.8]]);
check('flicking back and forth again pops again, once the cooldown is over', twice.length === 2 && twice[1] - twice[0] >= FLICK.cooldown, JSON.stringify(twice));
const quick = play([[0, 0.9], [0.05, -0.6], [0.08, -0.9], [0.1, 0.6]]);
check('two flicks inside the cooldown pop once', quick.length === 1, JSON.stringify(quick));

// --- the rails -----------------------------------------------------------------------------------------------------------------
const V = (x, y, z) => new THREE.Vector3(x, y, z);
const flat = railFromBox('RAIL_01', { center: V(2, 0.1, 0.3), halfExtents: V(0.6, 0.015, 0.02), quaternion: new THREE.Quaternion() });
check('a flat rail runs along its long side, on its top face', Math.abs(flat.a.x - 1.4) < 1e-6 && Math.abs(flat.b.x - 2.6) < 1e-6 && Math.abs(flat.a.y - 0.115) < 1e-6 && Math.abs(flat.length - 1.2) < 1e-6);
check('its direction points toward the higher x', flat.dir.x > 0.999);
// A box turned 180 degrees about Y is the same rail: the direction is still read toward +x.
const turned = railFromBox('RAIL_02', { center: V(2, 0.1, 0.3), halfExtents: V(0.6, 0.015, 0.02), quaternion: new THREE.Quaternion().setFromAxisAngle(V(0, 1, 0), Math.PI) });
check('a rail turned about is still ordered low x to high x', turned.dir.x > 0.999 && turned.a.x < turned.b.x);
// A box lying on its side (long side along x, thin side up): the grind line is still on top.
const side = railFromBox('RAIL_03', { center: V(0, 0.2, 0), halfExtents: V(0.5, 0.02, 0.01), quaternion: new THREE.Quaternion().setFromAxisAngle(V(1, 0, 0), Math.PI / 2) });
check('a rail box turned on its side puts the line on its highest face', Math.abs(side.a.y - 0.21) < 1e-6, `y=${side.a.y.toFixed(3)}`);
// A sloped rail (a handrail down a few steps).
const slope = railFromBox('RAIL_04', { center: V(0, 0.3, 0), halfExtents: V(0.5, 0.01, 0.01), quaternion: new THREE.Quaternion().setFromAxisAngle(V(0, 0, 1), Math.atan2(0.2, 1)) });
check('a sloped rail rises toward its far end', slope.b.y > slope.a.y + 0.15 && slope.dir.x > 0.9);

const rails = [flat];
const at = (x, y, z = 0.3) => V(x, y, z);
check('feet landing on the rail are caught', catchRail(rails, at(2, 0.13), -1.2)?.rail === flat);
check('the catch point is where the feet are along the rail', Math.abs(catchRail(rails, at(1.9, 0.13), -1)?.s - 0.5) < 1e-6);
check('feet too far to the side are not caught', catchRail(rails, at(2, 0.13, 0.5), -1) === null);
check('feet well above the rail are not caught', catchRail(rails, at(2, 0.4), -1) === null);
check('feet well under the rail are not caught', catchRail(rails, at(2, 0.0), -1) === null);
check('feet shooting up through it are not caught', catchRail(rails, at(2, 0.13), 1.8) === null);
check('feet past the end of the rail are not caught', catchRail(rails, at(2.8, 0.13), -1) === null);
check('the rail he just left is skipped', catchRail(rails, at(2, 0.13), -1, flat) === null);
const p = railPoint(slope, 0.5);
check('railPoint walks along the line and clamps at the ends', Math.abs(p.distanceTo(slope.a) - 0.5) < 1e-6 && railPoint(slope, 99).distanceTo(slope.b) < 1e-6);

// A rail running along z (a lane that comes down the screen) is ordered by z, and is caught the same way.
const alongZ = railFromBox('RAIL_05', { center: V(0, 0.19, -8), halfExtents: V(0.015, 0.01, 0.7), quaternion: new THREE.Quaternion() });
check('a rail along z is ordered low z to high z, with its line on top', alongZ.a.z < alongZ.b.z && Math.abs(alongZ.a.y - 0.2) < 1e-6 && Math.abs(alongZ.length - 1.4) < 1e-6);
check('feet over a rail along z are caught', catchRail([alongZ], V(0.02, 0.22, -8.1), -1)?.rail === alongZ);
check('feet beside a rail along z are not', catchRail([alongZ], V(0.2, 0.22, -8.1), -1) === null);

// --- the lane
const straight = Lane.straight(V(1, 0, 2), 0, -1, 100, 20);
check('a straight lane through a point runs the way it is told', Math.abs(straight.tangent(30).z + 1) < 1e-9 && Math.abs(straight.at(20).x - 1) < 1e-9 && Math.abs(straight.at(20).z - 2) < 1e-9);
check('the start of a straight lane is `behind` metres in', Math.abs(straight.project(1, 2, 0, Infinity) - 20) < 1e-6);
check('a point off either end of a lane carries on in a straight line', Math.abs(straight.at(-5).z - 27) < 1e-9 && Math.abs(straight.at(125).z - (-103)) < 1e-9);
check('projection ignores what is beside the lane', Math.abs(straight.project(3.5, -10, 20) - 32) < 1e-6);
// An L-shaped street with a hill: along +x for 10 m, then along -z for 10 m, rising 1 m on the first leg.
const bend = new Lane([V(0, 0, 0), V(10, 1, 0), V(10, 1, -10)]);
check('a bent lane measures along its path', Math.abs(bend.length - 20) < 1e-9 && Math.abs(bend.at(5).y - 0.5) < 1e-9 && Math.abs(bend.at(15).z + 5) < 1e-9);
check('its direction turns round the corner, smoothly', bend.tangent(2).x > 0.99 && bend.tangent(18).z < -0.99 && (() => { const m = bend.tangent(10); return m.x > 0.5 && m.z < -0.5; })());
check('projection finds the right leg of a bend near its hint', Math.abs(bend.project(10.4, -7, 17, 6) - 17) < 1e-6 && Math.abs(bend.project(7, 0.3, 7, 6) - 7) < 1e-6);
const hairpin = new Lane([V(0, 0, 0), V(20, 0, 0), V(20, 0, 1), V(0, 0, 1)]);
check('projection with a hint stays on its own stretch of a street that doubles back', Math.abs(hairpin.project(5, 0.6, 5, 6) - 5) < 1e-6 && Math.abs(hairpin.project(5, 0.6, 36, 6) - 36) < 1e-6);
try { new Lane([V(0, 0, 0), V(0, 5, 0)]); check('a lane with no horizontal length is refused', false); } catch { check('a lane with no horizontal length is refused', true); }

console.log(fails ? `\n${fails} FAILED` : '\nall passed');
process.exit(fails ? 1 : 0);
