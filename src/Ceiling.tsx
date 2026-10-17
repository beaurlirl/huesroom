"use client";

import { useMemo } from "react";
import * as THREE from "three";
import { useLevel } from "./useLevel";

/**
 * A level's roof (levels.ts `ceiling`): a flat ceiling with a few light panels, drawn from below only. A camera above it looks straight in (the rooms are cut-aways), a camera inside
 * sees the shop shut in over Hue. It has no collider: it is higher than any jump from the highest thing he can stand on, so nothing ever touches it. Unlit, so it is the same
 * flat warm white wherever the shop's lights fall.
 */
export function Ceiling() {
  const c = useLevel().ceiling;
  const panels = useMemo(() => {
    if (!c) return [];
    // Two rows of fluorescent panels along the shop, one over the aisles and one over the counter side.
    const out: [number, number][] = [];
    const n = Math.max(2, Math.round((c.x1 - c.x0) / 1.9));
    for (let i = 0; i < n; i++) for (const row of [0.3, 0.72]) out.push([c.x0 + ((i + 0.5) / n) * (c.x1 - c.x0), c.z0 + row * (c.z1 - c.z0)]);
    return out;
  }, [c]);
  if (!c) return null;
  const w = c.x1 - c.x0;
  const d = c.z1 - c.z0;
  return (
    <group position={[(c.x0 + c.x1) / 2, c.y, (c.z0 + c.z1) / 2]}>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <planeGeometry args={[w, d]} />
        <meshBasicMaterial color="#e8e6e0" side={THREE.FrontSide} />
      </mesh>
      {panels.map(([x, z], i) => (
        <mesh key={i} position={[x - (c.x0 + c.x1) / 2, -0.012, z - (c.z0 + c.z1) / 2]} rotation={[Math.PI / 2, 0, 0]}>
          <planeGeometry args={[1.2, 0.3]} />
          <meshBasicMaterial color="#ffffff" side={THREE.FrontSide} />
        </mesh>
      ))}
    </group>
  );
}
