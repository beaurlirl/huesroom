"use client";

import { useGLTF } from "@react-three/drei";
import { RigidBody, TrimeshCollider } from "@react-three/rapier";
import { useMemo } from "react";
import * as THREE from "three";
import { ASSETS } from "../config";
import { roomColliders } from "../Room";
import { useLevel } from "../useLevel";

type Part = { name: string; vertices: Float32Array; indices: Uint32Array };

/**
 * The collision of a skateboard street whose model ships its colliders as meshes (levels.ts `skate.collision`: a second glb of `COL_*` meshes). Each becomes a fixed mesh collider,
 * in world space. They are also entered in `roomColliders` as their bounding boxes, so what looks at the level's lowest solid (falling out of the world) works as it does for boxes.
 */
export function SkateCollision() {
  const level = useLevel();
  const gltf = useGLTF(level.skate!.collision!, ASSETS.draco);
  const parts = useMemo(() => {
    gltf.scene.updateMatrixWorld(true);
    const out: Part[] = [];
    const v = new THREE.Vector3();
    const added: typeof roomColliders = [];
    gltf.scene.traverse((o) => {
      const mesh = o as THREE.Mesh;
      const name = (o.userData.name as string | undefined) ?? o.name;
      if (!mesh.isMesh || !name.startsWith("COL_") || o.userData.retired) return;
      const pos = mesh.geometry.attributes.position;
      const vertices = new Float32Array(pos.count * 3);
      const box = new THREE.Box3();
      for (let i = 0; i < pos.count; i++) {
        v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
        vertices.set([v.x, v.y, v.z], i * 3);
        box.expandByPoint(v);
      }
      const index = mesh.geometry.index;
      const indices = index ? Uint32Array.from(index.array) : Uint32Array.from({ length: pos.count }, (_, i) => i);
      out.push({ name, vertices, indices });
      added.push({ name, center: box.getCenter(new THREE.Vector3()), halfExtents: box.getSize(new THREE.Vector3()).multiplyScalar(0.5), quaternion: new THREE.Quaternion(), userData: { ...o.userData, collision: "mesh" } });
    });
    roomColliders.push(...added);
    return out;
  }, [gltf.scene]);

  return (
    <RigidBody type="fixed" colliders={false}>
      {parts.map((p) => (
        <TrimeshCollider key={p.name} name={p.name} args={[p.vertices, p.indices]} />
      ))}
    </RigidBody>
  );
}
