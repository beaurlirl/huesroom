// Hips / feet / hands (metres, Hue scale; x = forward, y = up, z = side) over a clip.
import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const S = 0.1218, loader = new GLTFLoader();
const [n, step = '0.2'] = process.argv.slice(2);
const b = fs.readFileSync(`public/hue/anim/${n}.glb`);
const g = await new Promise((res, rej) => loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej));
const clip = g.animations[0], mixer = new THREE.AnimationMixer(g.scene); mixer.clipAction(clip).play();
const w = (nm) => g.scene.getObjectByName(nm).getWorldPosition(new THREE.Vector3()).multiplyScalar(S);
const f = (v) => v.toArray().map((x) => x.toFixed(3)).join(',');
for (let t = 0; t <= clip.duration + 1e-6; t += +step) {
  mixer.setTime(Math.min(t, clip.duration - 1e-4)); g.scene.updateMatrixWorld(true);
  console.log(t.toFixed(1), 'hips', f(w('mixamorigHips')), 'Lfoot', f(w('mixamorigLeftToeBase')), 'Rfoot', f(w('mixamorigRightToeBase')), 'Lhand', f(w('mixamorigLeftHand')), 'Rhand', f(w('mixamorigRightHand')));
}
