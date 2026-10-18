// Scratch: lists the colliders whose box reaches within `r` of a point. node tests/dev/probe-colliders.mjs <level> <x> <y> <z> [r]
import { open } from '../vt.mjs';
const [level, x, y, z, r = '0.4'] = process.argv.slice(2);
const { browser, page } = await open({ level });
const out = await page.evaluate(([x, y, z, r]) => {
  const w = window.__hue.world, res = [];
  w.forEachCollider((c) => {
    const t = c.translation(), s = c.shape;
    const he = s.halfExtents ?? (s.halfHeight !== undefined ? { x: s.radius, y: s.halfHeight + s.radius, z: s.radius } : null);
    const near = he && Math.abs(t.x - x) <= he.x + r && Math.abs(t.y - y) <= he.y + r && Math.abs(t.z - z) <= he.z + r;
    if (near) res.push({ type: s.type, t: [t.x, t.y, t.z].map((v) => +v.toFixed(3)), he: [he.x, he.y, he.z].map((v) => +v.toFixed(3)), sensor: c.isSensor(), fixed: c.parent()?.isFixed(), handle: c.handle });
  });
  return res;
}, [+x, +y, +z, +r]);
console.log(JSON.stringify(out, null, 1));
await browser.close();
