"use client";

import { useGLTF } from "@react-three/drei";
import { useFrame } from "@react-three/fiber";
import { ConvexHullCollider, CuboidCollider, RigidBody } from "@react-three/rapier";
import { useLayoutEffect, useMemo, useRef } from "react";
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

/** Room collider metadata by Rapier collider handle (filled as the colliders mount). */
export const colliderMeta = new Map<number, BoxCollider>();

/** Beanbag squash: set `bounceAt` to the clock time of a bounce. */
export const beanbag = { bounceAt: -Infinity, clock: () => 0 };

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

  const bag = useMemo(() => {
    let found: THREE.Object3D | undefined;
    scene.traverse((o) => {
      if (blenderName(o) === BEANBAG_VISUAL) found = o;
    });
    return found ? { obj: found, pos: found.position.clone(), scale: found.scale.clone() } : null;
  }, [scene]);

  // Squash on bounce: Y 0.85 → 1 with a slight XZ bulge over 0.25 s, pivoting on the floor.
  const clock = useRef(0);
  useFrame((_, dt) => {
    clock.current += dt;
    if (!bag) return;
    const t = (clock.current - beanbag.bounceAt) / 0.25;
    const k = t >= 0 && t < 1 ? (1 - t) * (1 - t) : 0;
    const sy = 1 - 0.15 * k;
    const sxz = 1 + 0.07 * k;
    bag.obj.scale.set(bag.scale.x * sxz, bag.scale.y * sy, bag.scale.z * sxz);
    const bottom = bag.pos.y - bag.scale.y * 0.25; // mesh local min y is -0.25
    bag.obj.position.y = bottom + (bag.pos.y - bottom) * sy;
  });
  useLayoutEffect(() => {
    beanbag.clock = () => clock.current;
  }, []);

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
        {hull && (
          <ConvexHullCollider
            name={BEANBAG_COLLIDER}
            args={[hull]}
            ref={(c) => {
              const meta = colliders.find((m) => m.name === BEANBAG_COLLIDER);
              if (c && meta) colliderMeta.set(c.handle, meta);
            }}
          />
        )}
        {colliders
          .filter((c) => !(hull && c.name === BEANBAG_COLLIDER))
          .map((c) => (
          <CuboidCollider
            key={c.name}
            name={c.name}
            args={[c.halfExtents.x, c.halfExtents.y, c.halfExtents.z]}
            position={c.center}
            quaternion={c.quaternion}
            ref={(col) => {
              if (col) colliderMeta.set(col.handle, c);
            }}
          />
          ))}
      </RigidBody>
    </>
  );
}

useGLTF.preload(ASSETS.room, ASSETS.draco);
