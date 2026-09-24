import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const loader = new GLTFLoader();
const load = (p) => new Promise((res, rej) => { const b = fs.readFileSync(p); loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej); });
const S = 0.1218;
for (const n of process.argv.slice(2)) {
  const g = await load(`public/hue/anim/${n}.glb`);
  const clip = g.animations[0];
  const mixer = new THREE.AnimationMixer(g.scene);
  const act = mixer.clipAction(clip); act.play();
  const get = (name) => g.scene.getObjectByName(name);
  const out = [];
  for (const t of [0, clip.duration * 0.5, clip.duration - 0.001]) {
    mixer.setTime(t); g.scene.updateMatrixWorld(true);
    const p = (nm) => { const v = new THREE.Vector3(); get(nm).getWorldPosition(v); return v.multiplyScalar(S).toArray().map(x => x.toFixed(3)).join(','); };
    out.push(`t=${t.toFixed(2)} hips[${p('mixamorigHips')}] Lfoot[${p('mixamorigLeftFoot')}] Rfoot[${p('mixamorigRightFoot')}] Ltoe[${p('mixamorigLeftToe_End')}] head[${p('mixamorigHeadTop_End')}]`);
  }
  console.log(n, clip.duration.toFixed(2), '\n  ' + out.join('\n  '));
}
