// Prints hips height / lowest foot / hips forward over time for a clip (metres, Hue scale).
import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const S = 0.1218;
const loader = new GLTFLoader();
for (const n of process.argv.slice(2)) {
  const b = fs.readFileSync(`public/hue/anim/${n}.glb`);
  const g = await new Promise((res, rej) => loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej));
  const clip = g.animations[0], mixer = new THREE.AnimationMixer(g.scene); mixer.clipAction(clip).play();
  const w = (nm) => g.scene.getObjectByName(nm).getWorldPosition(new THREE.Vector3()).multiplyScalar(S);
  const rows = [];
  for (let t = 0; t <= clip.duration + 1e-6; t += 0.1) {
    mixer.setTime(Math.min(t, clip.duration - 1e-4)); g.scene.updateMatrixWorld(true);
    const h = w('mixamorigHips'), lf = w('mixamorigLeftToeBase'), rf = w('mixamorigRightToeBase'), hd = w('mixamorigHeadTop_End');
    rows.push(`${t.toFixed(1)} hipY=${h.y.toFixed(3)} fwd=${h.x.toFixed(2)} foot=${Math.min(lf.y, rf.y).toFixed(3)} head=${hd.y.toFixed(2)}`);
  }
  console.log(`== ${n} ${clip.duration.toFixed(2)}s\n` + rows.join('\n'));
}
