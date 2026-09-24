"use client";

import { useGLTF } from "@react-three/drei";
import { CuboidCollider, RigidBody } from "@react-three/rapier";
import { useLayoutEffect, useMemo } from "react";
import * as THREE from "three";
import { ASSETS } from "./config";
import { runtime } from "./store";

export type BoxCollider = {
  name: string;
  center: THREE.Vector3;
  halfExtents: THREE.Vector3;
  quaternion: THREE.Quaternion;
  userData: Record<string, unknown>;
};

/** Every active COL_* node as an oriented box (world space). Read by the controller and debug views. */
export const roomColliders: BoxCollider[] = [];

function buildColliders(scene: THREE.Object3D): BoxCollider[] {
  scene.updateMatrixWorld(true);
  const out: BoxCollider[] = [];
  scene.traverse((obj) => {
    if (!obj.name.startsWith("COL_")) return;
    const mesh = obj as THREE.Mesh;
    mesh.visible = false;
    if (!mesh.isMesh || mesh.userData.retired) return;

    mesh.geometry.computeBoundingBox();
    const box = mesh.geometry.boundingBox!;
    const position = new THREE.Vector3();
    const quaternion = new THREE.Quaternion();
    const scale = new THREE.Vector3();
    mesh.matrixWorld.decompose(position, quaternion, scale);

    const center = box.getCenter(new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
    const halfExtents = box
      .getSize(new THREE.Vector3())
      .multiply(scale)
      .multiplyScalar(0.5);
    out.push({ name: mesh.name, center, halfExtents, quaternion, userData: { ...mesh.userData } });
  });
  return out;
}

export function Room() {
  const { scene } = useGLTF(ASSETS.room, ASSETS.draco);

  const colliders = useMemo(() => {
    const list = buildColliders(scene);
    roomColliders.length = 0;
    roomColliders.push(...list);
    const south = list.find((c) => c.name === "COL_Boundary south");
    if (south) runtime.openWallZ = south.center.z - south.halfExtents.z;
    return list;
  }, [scene]);

  useLayoutEffect(() => {
    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh || obj.name.startsWith("COL_")) return;
      const noCast = obj.userData.cast_shadow === false || obj.parent?.userData.cast_shadow === false;
      mesh.castShadow = !noCast;
      mesh.receiveShadow = true;
    });
  }, [scene]);

  return (
    <>
      <primitive object={scene} />
      <RigidBody type="fixed" colliders={false}>
        {colliders.map((c) => (
          <CuboidCollider
            key={c.name}
            name={c.name}
            args={[c.halfExtents.x, c.halfExtents.y, c.halfExtents.z]}
            position={c.center}
            quaternion={c.quaternion}
          />
        ))}
      </RigidBody>
    </>
  );
}

useGLTF.preload(ASSETS.room, ASSETS.draco);
