"use client";

import { useGLTF } from "@react-three/drei";
import { ConvexHullCollider, CuboidCollider, RigidBody } from "@react-three/rapier";
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

/** GLTFLoader sanitises node names ("COL_Floor slab" → "COL_Floor_slab"); the Blender name is kept here. */
export const blenderName = (obj: THREE.Object3D) => (obj.userData.name as string | undefined) ?? obj.name;

export const BEANBAG_VISUAL = "Beanbag | couch brown";
export const BEANBAG_COLLIDER = "COL_Beanbag";

/**
 * COL_Beanbag is a 0.70 × 0.76 m box, but the rendered bag bulges to ~1.07 × 1.15 m, so Hue
 * could walk ~19 cm into the leather. The visual node is tagged `collider: ellipsoid`, so we
 * use a convex hull of the bag itself for the solid, and keep COL_Beanbag's metadata.
 */
function beanbagHull(scene: THREE.Object3D): Float32Array | null {
  let bag: THREE.Object3D | undefined;
  scene.traverse((o) => {
    if (blenderName(o) === BEANBAG_VISUAL) bag = o;
  });
  if (!bag) return null;
  const pts: number[] = [];
  const v = new THREE.Vector3();
  bag.traverse((o) => {
    const mesh = o as THREE.Mesh;
    if (!mesh.isMesh) return;
    const pos = mesh.geometry.attributes.position;
    // Every 4th vertex is plenty for a hull and keeps it cheap.
    for (let i = 0; i < pos.count; i += 4) {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld);
      pts.push(v.x, v.y, v.z);
    }
  });
  return pts.length ? new Float32Array(pts) : null;
}

function buildColliders(scene: THREE.Object3D): BoxCollider[] {
  scene.updateMatrixWorld(true);
  const out: BoxCollider[] = [];
  scene.traverse((obj) => {
    if (!obj.name.startsWith("COL_")) return;
    const name = blenderName(obj);
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
    out.push({ name, center, halfExtents, quaternion, userData: { ...mesh.userData } });
  });
  return out;
}

export function Room() {
  const { scene } = useGLTF(ASSETS.room, ASSETS.draco);

  const { colliders, hull } = useMemo(() => {
    const list = buildColliders(scene);
    roomColliders.length = 0;
    roomColliders.push(...list);
    const south = list.find((c) => c.name === "COL_Boundary south");
    if (south) runtime.openWallZ = south.center.z - south.halfExtents.z;
    else console.warn("room.glb: COL_Boundary south missing; using default open-wall z");
    return { colliders: list, hull: beanbagHull(scene) };
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
        {hull && <ConvexHullCollider name={BEANBAG_COLLIDER} args={[hull]} />}
        {colliders
          .filter((c) => !(hull && c.name === BEANBAG_COLLIDER))
          .map((c) => (
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
