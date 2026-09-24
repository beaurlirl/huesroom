// Facing per clip: direction from the foot to the toe, and from the head to the nose (HeadTop_End vs Head).
import fs from 'fs';
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
const loader = new GLTFLoader();
for (const n of process.argv.slice(2)) {
  const b = fs.readFileSync(`public/hue/anim/${n}.glb`);
  const g = await new Promise((res, rej) => loader.parse(b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength), '', res, rej));
  const clip = g.animations[0], mixer = new THREE.AnimationMixer(g.scene); mixer.clipAction(clip).play();
  mixer.setTime(0.3); g.scene.updateMatrixWorld(true);
  const w = (nm) => g.scene.getObjectByName(nm).getWorldPosition(new THREE.Vector3());
  const toe = w('mixamorigLeftToe_End').sub(w('mixamorigLeftFoot')).setY(0).normalize();
  // Hips forward: hips local axes; use the direction from hips to the midpoint of the toes as a proxy.
  const hipsQ = g.scene.getObjectByName('mixamorigHips').getWorldQuaternion(new THREE.Quaternion());
  const hz = new THREE.Vector3(0, 0, 1).applyQuaternion(hipsQ).setY(0).normalize();
  console.log(n.padEnd(13), 'foot→toe', toe.toArray().map(v => v.toFixed(2)).join(','), ' hips+Z', hz.toArray().map(v => v.toFixed(2)).join(','));
}
