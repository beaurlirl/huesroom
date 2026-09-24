import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

/**
 * A reflection map just for the chrome coins: the room environment plus a few bright,
 * thin "light strips" (like drei's Lightformer) so the bevels catch crisp highlights as
 * they turn (prompt 2.7).
 */
export function createCoinEnvironment(renderer: THREE.WebGLRenderer) {
  const scene = new RoomEnvironment();
  const strip = (w: number, h: number, intensity: number, pos: [number, number, number], rotY: number, rotX = 0) => {
    const m = new THREE.Mesh(
      new THREE.PlaneGeometry(w, h),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(intensity, intensity, intensity), side: THREE.DoubleSide }),
    );
    m.position.set(...pos);
    m.rotation.set(rotX, rotY, 0);
    scene.add(m);
  };
  strip(0.5, 12, 18, [-7, 2, 0], Math.PI / 2);
  strip(0.4, 12, 14, [7, 2, 2], -Math.PI / 2);
  strip(12, 0.4, 16, [0, 8, 0], 0, Math.PI / 2);
  strip(0.3, 10, 10, [0, 2, 7], Math.PI);
  strip(0.3, 10, 10, [0, 2, -7], 0);

  const pmrem = new THREE.PMREMGenerator(renderer);
  const texture = pmrem.fromScene(scene, 0.02).texture;
  pmrem.dispose();
  scene.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (mesh.isMesh) {
      mesh.geometry.dispose();
      (mesh.material as THREE.Material).dispose();
    }
  });
  return texture;
}
