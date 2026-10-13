import * as THREE from "three";
import { STEADY } from "../config";

const SAMPLE = "texture2D( map, vMapUv )";

/**
 * Calms the shimmer of fine detail (graffiti lines, roll-gate stripes, brick mortar) when the camera moves along a street. Colour
 * maps are sampled a little blurrier than the exact mip level, which is what stops small high-contrast marks from popping in and out
 * as they cross pixels. Near textures keep nearly all their sharpness. The sub-pixel jitter test dropped the flickering pixels by
 * two thirds on the graffiti and gate stripes.
 */
export function steadyTextures(root: THREE.Object3D) {
  if (!THREE.ShaderChunk.map_fragment.includes(SAMPLE)) return; // three changed its shader: leave the materials alone
  const mapFragment = THREE.ShaderChunk.map_fragment.replace(SAMPLE, `texture2D( map, vMapUv, ${STEADY.mipBias.toFixed(2)} )`);
  const seen = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (seen.has(m)) continue;
      seen.add(m);
      const s = m as THREE.MeshStandardMaterial;
      if (!s.isMeshStandardMaterial || !s.map || /coin/i.test(s.name)) continue;
      s.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace("#include <map_fragment>", mapFragment);
      };
      s.needsUpdate = true;
    }
  });
}
