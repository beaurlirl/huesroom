import * as THREE from "three";

/**
 * Colour for a level without a rebuild or a single extra triangle or texture (levels.ts `paint`): material name -> the colour, roughness, metalness or glow to give it once the model
 * has loaded. The deli's plaster, tile, counter fronts and countertop came out of the model with no colour at all (white), so most of its surfaces were the same pale grey; this is the
 * palette from the owner's entrance photo (warm cream walls and floor tiles) with a few accents. Materials are matched by their name in the model.
 */
export type Paint = { color?: string; roughness?: number; metalness?: number; emissive?: string };

export function paintMaterials(root: THREE.Object3D, paint: Record<string, Paint>) {
  const done = new Set<THREE.Material>();
  root.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    for (const m of Array.isArray(mesh.material) ? mesh.material : [mesh.material]) {
      if (done.has(m)) continue;
      done.add(m);
      const p = paint[m.name];
      const s = m as THREE.MeshStandardMaterial;
      if (!p || !s.color) continue;
      if (p.color !== undefined) s.color.set(p.color);
      if (p.roughness !== undefined) s.roughness = p.roughness;
      if (p.metalness !== undefined) s.metalness = p.metalness;
      if (p.emissive !== undefined) s.emissive.set(p.emissive);
    }
  });
}
