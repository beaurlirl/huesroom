"use client";

import { useGLTF } from "@react-three/drei";
import { ConvexHullCollider, RigidBody, type RapierRigidBody } from "@react-three/rapier";
import { useEffect, useMemo, useRef } from "react";
import * as THREE from "three";
import { playSfx } from "./audio/sfx";
import { ASSETS, BOOKS, CANS } from "./config";
import { pushableBodies } from "./pushables";
import { blenderName, colliderMeta, roomColliders } from "./Room";
import { useGame } from "./store";

type Can = { name: string; group: THREE.Group; position: THREE.Vector3; halfHeight: number; radius: number; hull: Float32Array };

/**
 * A 12-sided prism: stands still on a flat top (Rapier's round cylinder jitters there and
 * slowly toppled every can before the intro) but still rolls once it's knocked over.
 */
function prismHull(halfHeight: number, radius: number, sides = 12) {
  const pts: number[] = [];
  for (let i = 0; i < sides; i++) {
    const a = (i / sides) * Math.PI * 2;
    const x = Math.cos(a) * radius;
    const z = Math.sin(a) * radius;
    pts.push(x, -halfHeight, z, x, halfHeight, z);
  }
  return new Float32Array(pts);
}

// Cut once per scene (a second memo pass under StrictMode must not find them missing).
const cache = new WeakMap<THREE.Object3D, Can[]>();

/**
 * The three spray cans are baked into the merged ROOM_static mesh. Cut each one's triangles
 * (body, nozzle, cap: only the can materials, only inside that can's COL_Spray can box) out
 * of the room geometry into its own mesh, so it can be a dynamic body like the books.
 */
function extractCans(scene: THREE.Object3D): Can[] {
  const cached = cache.get(scene);
  if (cached) return cached;

  let room: THREE.Object3D | undefined;
  scene.traverse((o) => {
    if (blenderName(o) === "ROOM_static") room = o;
  });
  const boxes = roomColliders.filter((c) => c.name.startsWith("COL_Spray can"));
  if (!room || !boxes.length) return [];
  room.updateMatrixWorld(true);

  const meshes: THREE.Mesh[] = [];
  room.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && CANS.materials.includes((m.material as THREE.Material).name)) meshes.push(m);
  });

  const cans: Can[] = boxes.map((b) => {
    const radius = Math.max(b.halfExtents.x, b.halfExtents.z);
    return {
      name: b.name,
      group: new THREE.Group(),
      position: b.center.clone(),
      halfHeight: b.halfExtents.y,
      radius,
      hull: prismHull(b.halfExtents.y, radius),
    };
  });

  const a = new THREE.Vector3();
  const bb = new THREE.Vector3();
  const c = new THREE.Vector3();
  const margin = 0.012;
  for (const mesh of meshes) {
    const g = mesh.geometry;
    const pos = g.attributes.position;
    const index = g.index;
    if (!index) continue;
    const keep: number[] = [];
    const taken: number[][] = cans.map(() => []);
    for (let t = 0; t < index.count; t += 3) {
      const i0 = index.getX(t);
      const i1 = index.getX(t + 1);
      const i2 = index.getX(t + 2);
      a.fromBufferAttribute(pos, i0).applyMatrix4(mesh.matrixWorld);
      bb.fromBufferAttribute(pos, i1).applyMatrix4(mesh.matrixWorld);
      c.fromBufferAttribute(pos, i2).applyMatrix4(mesh.matrixWorld);
      const cx = (a.x + bb.x + c.x) / 3;
      const cy = (a.y + bb.y + c.y) / 3;
      const cz = (a.z + bb.z + c.z) / 3;
      const k = boxes.findIndex(
        (b) =>
          Math.abs(cx - b.center.x) < b.halfExtents.x + margin &&
          Math.abs(cy - b.center.y) < b.halfExtents.y + margin &&
          Math.abs(cz - b.center.z) < b.halfExtents.z + margin,
      );
      if (k < 0) keep.push(i0, i1, i2);
      else taken[k].push(i0, i1, i2);
    }
    if (keep.length === index.count) continue;

    taken.forEach((tris, k) => {
      if (!tris.length) return;
      // Copy the triangles into can-local space (origin at the can's centre).
      const out = new THREE.BufferGeometry();
      const names = Object.keys(g.attributes);
      for (const name of names) {
        const src = g.attributes[name] as THREE.BufferAttribute;
        const arr = new Float32Array(tris.length * src.itemSize);
        for (let i = 0; i < tris.length; i++) for (let j = 0; j < src.itemSize; j++) arr[i * src.itemSize + j] = src.getComponent(tris[i], j);
        out.setAttribute(name, new THREE.BufferAttribute(arr, src.itemSize, src.normalized));
      }
      const toLocal = new THREE.Matrix4().makeTranslation(-cans[k].position.x, -cans[k].position.y, -cans[k].position.z).multiply(mesh.matrixWorld);
      out.applyMatrix4(toLocal);
      const piece = new THREE.Mesh(out, mesh.material);
      piece.castShadow = true;
      piece.receiveShadow = true;
      cans[k].group.add(piece);
    });
    g.setIndex(keep);
  }

  cache.set(scene, cans);
  return cans;
}

/** Pushable spray cans (user request), like the books: shoved walking, kicked running. */
export function SprayCans() {
  const { scene } = useGLTF(ASSETS.room, ASSETS.draco);
  const runId = useGame((s) => s.runId);
  const cans = useMemo(() => extractCans(scene), [scene]);
  const bodies = useRef<(RapierRigidBody | null)[]>([]);

  useEffect(() => {
    if (runId === 0) return;
    cans.forEach((can, i) => {
      const body = bodies.current[i];
      if (!body) return;
      body.setTranslation(can.position, true);
      body.setRotation({ x: 0, y: 0, z: 0, w: 1 }, true);
      body.setLinvel({ x: 0, y: 0, z: 0 }, true);
      body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    });
  }, [runId, cans]);

  return (
    <>
      {cans.map((can, i) => (
        <RigidBody
          key={can.name}
          ref={(body) => {
            const prev = bodies.current[i];
            if (prev) pushableBodies.delete(prev);
            bodies.current[i] = body;
            if (body) pushableBodies.add(body);
          }}
          type="dynamic"
          colliders={false}
          position={can.position}
          ccd
          linearDamping={0.05}
          angularDamping={0.3}
          userData={{ can: can.name }}
          onCollisionEnter={({ rigidBody, other }) => {
            const meta = other.collider ? colliderMeta.get(other.collider.handle) : undefined;
            if (!rigidBody || meta?.name !== "COL_Floor slab") return;
            const v = rigidBody.linvel();
            const speed = Math.hypot(v.x, v.y, v.z);
            if (speed > BOOKS.thudSpeed) playSfx("thud", { pitch: CANS.clinkPitch, volume: Math.min(1, speed / 3) });
          }}
        >
          <ConvexHullCollider args={[can.hull]} mass={CANS.massKg} friction={CANS.friction} restitution={CANS.restitution} />
          <primitive object={can.group} />
        </RigidBody>
      ))}
    </>
  );
}
